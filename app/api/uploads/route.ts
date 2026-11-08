import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { initUpload } from "@/lib/uploads";
import { handleApiError, json, readJson } from "@/lib/request";
import { uploadInitSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireMutationUser(request);
    const input = await readJson(request, uploadInitSchema);
    const result = await initUpload(user.id, {
      filename: input.filename,
      size: input.size,
      mimeType: input.mimeType,
      parentId: input.parentId || null,
      fingerprint: input.fingerprint,
    });
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "upload.initialized",
      targetType: "upload",
      targetId: result.uploadId,
      metadata: { filename: result.filename, size: input.size, resumed: result.resumed },
    });
    return json(result, { status: result.resumed ? 200 : 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
