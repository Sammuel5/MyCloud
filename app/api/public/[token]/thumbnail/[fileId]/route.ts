import type { NextRequest } from "next/server";
import { requireUnlockedPublicLink } from "@/lib/public-access";
import { validatePublicFile } from "@/lib/shares";
import { thumbnailResponse } from "@/lib/content-response";
import { handleApiError } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string; fileId: string } }
) {
  try {
    const resolved = await requireUnlockedPublicLink(request, params.token);
    const file = await validatePublicFile(resolved.link, params.fileId);
    return await thumbnailResponse(file);
  } catch (error) {
    return handleApiError(error);
  }
}
