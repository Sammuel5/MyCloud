import { requireApiUser } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { UserSession } from "@/models/UserSession";
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  json,
} from "@/lib/request";
import { auditEvent } from "@/lib/audit";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    await connectDB();
    const session = await UserSession.findOne({
      _id: params.sessionId,
      userId: user.id,
    }).lean();
    if (!session) throw new ApiError(404, "Session not found", "NOT_FOUND");
    if (session.sidHash === user.authSessionHash) {
      throw new ApiError(
        400,
        "Use sign out to end your current session",
        "CURRENT_SESSION"
      );
    }
    await UserSession.updateOne(
      { _id: session._id },
      { $set: { revokedAt: new Date() } }
    );
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "auth.session.revoked",
      targetType: "session",
      targetId: session._id.toString(),
      severity: "security",
    });
    return json({ revoked: true });
  } catch (error) {
    return handleApiError(error);
  }
}
