import {
  getAccessibleQueryContext,
  getStarredIds,
  resolveItemRoles,
} from "@/lib/access";
import { File } from "@/models/File";
import { ownerNamesFor } from "@/lib/item-dto";
import { fileToDTO } from "@/lib/item-dto";
import type { MediaResponse } from "@/lib/types";

export async function listMedia(
  userId: string,
  kind: "photos" | "videos",
  page: number,
  limit: number
): Promise<MediaResponse> {
  const context = await getAccessibleQueryContext(userId);
  const mimeFilter = kind === "photos" ? /^image\//i : /^video\//i;
  const filter = {
    $and: [
      { deletedAt: null },
      context.fileFilter,
      { mimeType: mimeFilter },
    ],
  };
  const offset = (page - 1) * limit;
  const [files, total] = await Promise.all([
    File.find(filter).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit).lean(),
    File.countDocuments(filter),
  ]);
  const roles = await resolveItemRoles(userId, [], files);
  const [stars, ownerNames] = await Promise.all([
    getStarredIds(userId, files, []),
    ownerNamesFor(userId, files, []),
  ]);
  const items = files
    .map((file) => {
      const role = roles.get(`file:${file._id}`);
      if (!role) return null;
      return fileToDTO(
        file,
        role,
        stars.has(`file:${file._id}`),
        ownerNames.get(file.owner.toString())
      );
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return { items, total, page, limit, kind };
}
