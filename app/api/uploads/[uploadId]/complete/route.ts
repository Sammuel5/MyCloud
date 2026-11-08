import { requireMutationUser } from "@/lib/api-guard";
import { auditEvent } from "@/lib/audit";
import { completeUpload } from "@/lib/uploads";
import { handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: { uploadId: string } }
) {
  try {
    const user = await requireMutationUser(request);
    const result = await completeUpload(user.id, params.uploadId);
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "upload.completed",
      targetType: "file",
      targetId: result.file.id,
      metadata: {
        name: result.file.name,
        size: result.file.size,
        duplicate: result.duplicateOf?.id || null,
      },
    });
    return json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
