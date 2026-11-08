import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { hashIpAddress, hashSessionId, randomToken } from "@/lib/crypto";
import { getSessionMaxAgeSeconds } from "@/lib/config";
import { requestIp, userAgent } from "@/lib/request";
import { UserSession } from "@/models/UserSession";

const MAX_ACTIVE_SESSIONS = 10;

export interface CreatedAuthSession {
  sidHash: string;
  expiresAt: Date;
}

export async function createAuthSession(
  userId: Types.ObjectId | string,
  request: Request
): Promise<CreatedAuthSession> {
  await connectDB();
  const sidHash = hashSessionId(randomToken(32));
  const expiresAt = new Date(Date.now() + getSessionMaxAgeSeconds() * 1000);

  await UserSession.create({
    userId,
    sidHash,
    userAgent: userAgent(request),
    ipHash: hashIpAddress(requestIp(request)),
    lastSeenAt: new Date(),
    expiresAt,
  });

  const excess = await UserSession.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .skip(MAX_ACTIVE_SESSIONS)
    .select("_id")
    .lean();

  if (excess.length > 0) {
    await UserSession.updateMany(
      { _id: { $in: excess.map((session) => session._id) } },
      { $set: { revokedAt: new Date() } }
    );
  }

  return { sidHash, expiresAt };
}

export async function revokeAuthSession(sidHash: string): Promise<void> {
  await connectDB();
  await UserSession.updateOne(
    { sidHash, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

export async function revokeAllUserSessions(
  userId: Types.ObjectId | string,
  exceptSidHash?: string
): Promise<void> {
  await connectDB();
  const filter: Record<string, unknown> = { userId, revokedAt: null };
  if (exceptSidHash) filter.sidHash = { $ne: exceptSidHash };
  await UserSession.updateMany(filter, { $set: { revokedAt: new Date() } });
}

export async function validateAuthSession(
  userId: string,
  sidHash: string,
  tokenVersion: number
): Promise<{ user: import("@/models/User").IUser; touched: boolean } | null> {
  await connectDB();
  const session = await UserSession.findOne({
    userId,
    sidHash,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) return null;

  const { User } = await import("@/models/User");
  const user = await User.findOne({ _id: userId, active: true }).lean();
  if (!user || user.sessionVersion !== tokenVersion) {
    await UserSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
    return null;
  }

  let touched = false;
  if (Date.now() - new Date(session.lastSeenAt).getTime() > 5 * 60 * 1000) {
    touched = true;
    await UserSession.updateOne(
      { _id: session._id, revokedAt: null },
      { $set: { lastSeenAt: new Date() } }
    ).catch(() => undefined);
  }

  return { user, touched };
}
