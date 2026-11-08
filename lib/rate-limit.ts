import { createHash } from "node:crypto";
import { connectDB } from "@/lib/db";
import { RateLimitBucket } from "@/models/RateLimitBucket";
import { logger } from "@/lib/logger";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Durable fixed-window limiter. Keys are hashed so raw emails/IP addresses
 * are not retained in the rate-limit collection.
 */
export async function consumeRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  await connectDB();
  const windowNumber = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = createHash("sha256")
    .update(`${scope}:${identifier}:${windowNumber}`)
    .digest("hex");
  const expiresAt = new Date((windowNumber + 1) * windowSeconds * 1000 + 5_000);

  try {
    const bucket = await RateLimitBucket.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    const count = bucket?.count ?? 1;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil(expiresAt.getTime() / 1000 - Date.now() / 1000)),
    };
  } catch (error) {
    logger.error("Rate limiter unavailable", { error, scope });
    // Fail closed for security-sensitive actions if the DB cannot enforce limits.
    return { allowed: false, remaining: 0, retryAfterSeconds: 30 };
  }
}

export async function enforceRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  return consumeRateLimit(scope, identifier, limit, windowSeconds);
}
