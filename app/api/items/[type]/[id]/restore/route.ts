import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { restoreTrashItem } from "@/lib/trash";
import { ApiError, handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const user = await requireMutationUser(request);
    if (params.type !== "file" && params.type !== "folder") {
      throw new ApiError(404, "Unknown item type", "NOT_FOUND");
    }
    const result = await restoreTrashItem(user.id, params.type, params.id);
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "item.restored",
      targetType: params.type,
      targetId: params.id,
      metadata: { parentId: result.parentId },
    });
    return json({ restored: true, parentId: result.parentId });
  } catch (error) {
    return handleApiError(error);
  }
}
