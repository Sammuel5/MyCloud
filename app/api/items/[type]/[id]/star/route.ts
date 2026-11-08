import { requireMutationUser } from "@/lib/api-guard";
import { toggleStar } from "@/lib/folders";
import { ApiError, handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";

function parseType(value: string): "file" | "folder" {
  if (value !== "file" && value !== "folder") {
    throw new ApiError(404, "Unknown item type", "NOT_FOUND");
  }
  return value;
}

export async function POST(
  request: Request,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const user = await requireMutationUser(request);
    await toggleStar(user.id, parseType(params.type), params.id, true);
    return json({ starred: true });
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
    await toggleStar(user.id, parseType(params.type), params.id, false);
    return json({ starred: false });
  } catch (error) {
    return handleApiError(error);
  }
}
