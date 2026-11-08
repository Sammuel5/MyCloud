import type { NextRequest } from "next/server";
import {
  getPublicLinkByToken,
  verifyPublicLinkPassword,
} from "@/lib/shares";
import { setPublicAccessCookie } from "@/lib/public-access";
import {
  ApiError,
  handleApiError,
  json,
  readJson,
  requestIp,
  userAgent,
  assertSameOrigin,
} from "@/lib/request";
import { consumeRateLimit } from "@/lib/rate-limit";
import { auditEvent } from "@/lib/audit";
import { hashIpAddress } from "@/lib/crypto";
import { unlockSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    assertSameOrigin(request);
    const resolved = await getPublicLinkByToken(params.token);
    if (!resolved.link.passwordHash) {
      return json({ unlocked: true });
    }
    const ip = requestIp(request) || "unknown";
    const limit = await consumeRateLimit(
      "public-link-password",
      `${resolved.link._id}:${ip}`,
      10,
      15 * 60
    );
    if (!limit.allowed) {
      throw new ApiError(429, "Too many attempts. Try again later.", "RATE_LIMITED");
    }
    const input = await readJson(request, unlockSchema);
    const valid = await verifyPublicLinkPassword(resolved.link, input.password);
    if (!valid) {
      await auditEvent({
        action: "public.unlock.failed",
        targetType: "share_link",
        targetId: resolved.link._id.toString(),
        severity: "security",
        ipHash: hashIpAddress(ip),
        userAgent: userAgent(request),
      });
      throw new ApiError(401, "Incorrect password", "INVALID_PASSWORD");
    }
    const response = json({ unlocked: true });
    setPublicAccessCookie(response, request, resolved.link.tokenHash);
    await auditEvent({
      action: "public.unlock.success",
      targetType: "share_link",
      targetId: resolved.link._id.toString(),
      severity: "info",
      ipHash: hashIpAddress(ip),
      userAgent: userAgent(request),
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
