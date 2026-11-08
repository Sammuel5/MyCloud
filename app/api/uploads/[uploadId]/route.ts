import { requireMutationUser } from "@/lib/api-guard";
import { requirePasswordReadyApiUser } from "@/lib/auth-user";
import { abortUpload, getUploadStatus } from "@/lib/uploads";
import { handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { uploadId: string } }
) {
  try {
    const user = await requirePasswordReadyApiUser();
    return json(await getUploadStatus(user.id, params.uploadId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { uploadId: string } }
) {
  try {
    const user = await requireMutationUser(request);
    await abortUpload(user.id, params.uploadId);
    return json({ aborted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
