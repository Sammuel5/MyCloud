import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { removeShare } from "@/lib/shares";
import { handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: { shareId: string } }
) {
  try {
    const user = await requireMutationUser(request);
    await removeShare(user.id, params.shareId);
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "share.removed",
      targetType: "share",
      targetId: params.shareId,
    });
    return json({ removed: true });
  } catch (error) {
    return handleApiError(error);
  }
}
