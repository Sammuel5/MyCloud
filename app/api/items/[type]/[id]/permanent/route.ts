import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { permanentlyDeleteTrashItem } from "@/lib/trash";
import { ApiError, handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const user = await requireMutationUser(request);
    if (params.type !== "file" && params.type !== "folder") {
      throw new ApiError(404, "Unknown item type", "NOT_FOUND");
    }
    await permanentlyDeleteTrashItem(user.id, params.type, params.id);
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "item.permanently_deleted",
      targetType: params.type,
      targetId: params.id,
      severity: "warning",
    });
    return json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
