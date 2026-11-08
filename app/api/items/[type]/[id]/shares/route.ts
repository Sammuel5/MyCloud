import { requirePasswordReadyApiUser } from "@/lib/auth-user";
import { getResourceShares } from "@/lib/shares";
import { ApiError, handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const user = await requirePasswordReadyApiUser();
    if (params.type !== "file" && params.type !== "folder") {
      throw new ApiError(404, "Unknown item type", "NOT_FOUND");
    }
    return json(await getResourceShares(user.id, params.type, params.id));
  } catch (error) {
    return handleApiError(error);
  }
}
