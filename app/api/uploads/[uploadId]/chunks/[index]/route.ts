import { requireMutationUser } from "@/lib/api-guard";
import { writeUploadChunk } from "@/lib/uploads";
import { ApiError, handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function PUT(
  request: Request,
  { params }: { params: { uploadId: string; index: string } }
) {
  try {
    const user = await requireMutationUser(request);
    const index = Number(params.index);
    if (!Number.isInteger(index) || index < 0) {
      throw new ApiError(400, "Invalid chunk index", "INVALID_CHUNK");
    }
    return json(await writeUploadChunk(user.id, params.uploadId, index, request));
  } catch (error) {
    return handleApiError(error);
  }
}
