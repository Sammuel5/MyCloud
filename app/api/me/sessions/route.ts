import { requireApiUser } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { UserSession } from "@/models/UserSession";
import { assertSameOrigin, handleApiError, json } from "@/lib/request";
import { revokeAllUserSessions } from "@/lib/auth-sessions";
import { auditEvent } from "@/lib/audit";
import type { SessionDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser();
    await connectDB();
    const sessions = await UserSession.find({
      userId: user.id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastSeenAt: -1 })
      .lean();
    const result: SessionDTO[] = sessions.map((session) => ({
      id: session._id.toString(),
      userAgent: session.userAgent || "Unknown client",
      lastSeenAt: session.lastSeenAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      current: session.sidHash === user.authSessionHash,
    }));
    return json({ sessions: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    await revokeAllUserSessions(user.id, user.authSessionHash);
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "auth.sessions.revoked_others",
      severity: "security",
    });
    return json({ revoked: true });
  } catch (error) {
    return handleApiError(error);
  }
}
