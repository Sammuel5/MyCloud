import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { moveItem, toggleStar } from "@/lib/folders";
import { permanentlyDeleteTrashItem, restoreTrashItem, trashItem } from "@/lib/trash";
import { handleApiError, json, readJson } from "@/lib/request";
import { batchActionSchema } from "@/lib/validation";

export const runtime = "nodejs";

interface BatchResult {
  type: "file" | "folder";
  id: string;
  ok: boolean;
  error?: string;
  code?: string;
}

export async function POST(request: Request) {
  try {
    const user = await requireMutationUser(request);
    const input = await readJson(request, batchActionSchema);
    const results: BatchResult[] = [];

    for (const item of input.items) {
      try {
        switch (input.action) {
          case "trash":
            await trashItem(user.id, item.type, item.id);
            break;
          case "restore":
            await restoreTrashItem(user.id, item.type, item.id);
            break;
          case "permanent":
            await permanentlyDeleteTrashItem(user.id, item.type, item.id);
            break;
          case "move":
            await moveItem(user.id, item.type, item.id, input.parentId || null);
            break;
          case "star":
            await toggleStar(user.id, item.type, item.id, true);
            break;
          case "unstar":
            await toggleStar(user.id, item.type, item.id, false);
            break;
        }
        results.push({ type: item.type, id: item.id, ok: true });
      } catch (error) {
        const err = error as { message?: string; code?: string };
        results.push({
          type: item.type,
          id: item.id,
          ok: false,
          error: err.message || "Operation failed",
          code: err.code,
        });
      }
    }

    const succeeded = results.filter((result) => result.ok).length;
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: `item.batch.${input.action}`,
      severity: input.action === "permanent" ? "warning" : "info",
      metadata: {
        requested: input.items.length,
        succeeded,
        failed: results.length - succeeded,
        parentId: input.parentId || null,
      },
    });
    return json({
      ok: succeeded === results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
