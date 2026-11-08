import { requireMutationUser } from "@/lib/api-guard";
import { requirePasswordReadyApiUser } from "@/lib/auth-user";
import { auditEvent } from "@/lib/audit";
import { getItemDetails } from "@/lib/items";
import { moveItem, renameItem } from "@/lib/folders";
import { trashItem } from "@/lib/trash";
import { ApiError, handleApiError, json, readJson } from "@/lib/request";
import { updateItemSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemType = "file" | "folder";

function parseType(value: string): ItemType {
  if (value !== "file" && value !== "folder") {
    throw new ApiError(404, "Unknown item type", "NOT_FOUND");
  }
  return value;
}

export async function GET(
  _request: Request,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const user = await requirePasswordReadyApiUser();
    const type = parseType(params.type);
    return json({ item: await getItemDetails(user.id, type, params.id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const user = await requireMutationUser(request);
    const type = parseType(params.type);
    const input = await readJson(request, updateItemSchema);

    if (input.name !== undefined) {
      await renameItem(user.id, type, params.id, input.name);
    }
    if (input.parentId !== undefined) {
      await moveItem(user.id, type, params.id, input.parentId || null);
    }
    const item = await getItemDetails(user.id, type, params.id);
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: input.parentId !== undefined ? "item.moved" : "item.renamed",
      targetType: type,
      targetId: params.id,
      metadata: {
        parentId: input.parentId ?? undefined,
        renamed: input.name !== undefined,
      },
    });
    return json({ item });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const user = await requireMutationUser(request);
    const type = parseType(params.type);
    await trashItem(user.id, type, params.id);
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "item.trashed",
      targetType: type,
      targetId: params.id,
      severity: "info",
    });
    return json({ trashed: true });
  } catch (error) {
    return handleApiError(error);
  }
}
