import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { copyItem } from "@/lib/copy";
import { ApiError, handleApiError, json, readJson } from "@/lib/request";
import { copyItemSchema } from "@/lib/validation";

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
    const input = await readJson(request, copyItemSchema);
    const item = await copyItem(
      user.id,
      params.type,
      params.id,
      input.parentId || null,
      user.storageQuotaBytes
    );
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "item.copied",
      targetType: params.type,
      targetId: params.id,
      metadata: {
        destinationParentId: input.parentId || null,
        newId: (item as { id?: string }).id,
      },
    });
    return json({ item });
  } catch (error) {
    return handleApiError(error);
  }
}
