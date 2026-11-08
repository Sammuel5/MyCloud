import { requirePasswordReadyApiUser } from "@/lib/auth-user";
import { requireItemAccess } from "@/lib/access";
import { thumbnailResponse } from "@/lib/content-response";
import { ApiError, handleApiError } from "@/lib/request";
import type { IFile } from "@/models/File";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const user = await requirePasswordReadyApiUser();
    if (params.type !== "file") {
      throw new ApiError(400, "Only files have thumbnails", "INVALID_ITEM_TYPE");
    }
    const access = await requireItemAccess(user.id, "file", params.id);
    return await thumbnailResponse(access.item as IFile);
  } catch (error) {
    return handleApiError(error);
  }
}
