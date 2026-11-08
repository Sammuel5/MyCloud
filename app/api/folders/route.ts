import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { createFolder } from "@/lib/folders";
import { handleApiError, json, readJson } from "@/lib/request";
import { createFolderSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireMutationUser(request);
    const input = await readJson(request, createFolderSchema);
    const folder = await createFolder(user.id, {
      name: input.name,
      parentId: input.parentId || null,
    });
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "folder.created",
      targetType: "folder",
      targetId: folder.id,
      metadata: { parentId: input.parentId || null },
    });
    return json({ folder }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
