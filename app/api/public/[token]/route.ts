import type { NextRequest } from "next/server";
import {
  getPublicLinkByToken,
  publicFolderItems,
  publicShareInfo,
  validatePublicFolder,
} from "@/lib/shares";
import {
  publicAccessCookieName,
  verifyPublicAccess,
} from "@/lib/crypto";
import { queryObject } from "@/lib/api-guard";
import { ApiError, handleApiError, json } from "@/lib/request";
import { publicFolderQuerySchema } from "@/lib/validation";
import type { PublicItemDTO, PublicShareInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const resolved = await getPublicLinkByToken(params.token);
    const cookie = request.cookies.get(
      publicAccessCookieName(resolved.link.tokenHash)
    )?.value;
    const locked =
      Boolean(resolved.link.passwordHash) &&
      !verifyPublicAccess(cookie, resolved.link.tokenHash);
    const info: PublicShareInfo = publicShareInfo(resolved);
    if (locked) {
      return json({ locked: true, info });
    }

    if (resolved.link.resourceType === "file") {
      return json({
        locked: false,
        info,
        fileId: resolved.resource._id.toString(),
      });
    }

    const parsed = publicFolderQuerySchema.safeParse(queryObject(request));
    if (!parsed.success) {
      throw new ApiError(400, "Invalid folder identifier", "INVALID_ID");
    }
    const folderId = parsed.data.folderId || resolved.link.resourceId.toString();
    await validatePublicFolder(resolved.link, folderId);
    const listing = await publicFolderItems(resolved.link, folderId);
    const items: PublicItemDTO[] = listing.items;
    return json({
      locked: false,
      info,
      folder: listing.folder,
      items,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
