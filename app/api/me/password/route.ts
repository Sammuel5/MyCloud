import bcrypt from "bcryptjs";
import { requireApiUser } from "@/lib/auth-user";
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requestIp,
  userAgent,
} from "@/lib/request";
import { changePasswordSchema } from "@/lib/validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { hashIpAddress } from "@/lib/crypto";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { revokeAllUserSessions } from "@/lib/auth-sessions";
import { auditEvent } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const rate = await consumeRateLimit("password-change", user.id, 5, 15 * 60);
    if (!rate.allowed) {
      throw new ApiError(429, "Too many attempts. Try again later.", "RATE_LIMITED");
    }
    const input = await readJson(request, changePasswordSchema);
    await connectDB();
    const fullUser = await User.findById(user.id).select("+passwordHash").lean();
    if (!fullUser) throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
    const valid = await bcrypt.compare(input.currentPassword, fullUser.passwordHash);
    if (!valid) {
      await auditEvent({
        actorId: user.id,
        actorEmail: user.email,
        action: "auth.password_change.failed",
        severity: "security",
        ipHash: hashIpAddress(requestIp(request)),
        userAgent: userAgent(request),
      });
      throw new ApiError(400, "Current password is incorrect", "INVALID_PASSWORD");
    }
    if (await bcrypt.compare(input.newPassword, fullUser.passwordHash)) {
      throw new ApiError(400, "New password must be different", "PASSWORD_UNCHANGED");
    }
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await User.updateOne(
      { _id: user.id },
      {
        $set: {
          passwordHash,
          mustChangePassword: false,
        },
        $inc: { sessionVersion: 1 },
      }
    );
    await revokeAllUserSessions(user.id);
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "auth.password_changed",
      severity: "security",
      ipHash: hashIpAddress(requestIp(request)),
      userAgent: userAgent(request),
    });
    return json({ reauthRequired: true });
  } catch (error) {
    return handleApiError(error);
  }
}
