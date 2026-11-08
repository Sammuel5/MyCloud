import { Types } from "mongoose";
import type { IFile } from "@/models/File";
import type { IFolder } from "@/models/Folder";
import { User } from "@/models/User";
import {
  canPreviewFile,
  categoryForMime,
  isInlineSafeMime,
} from "@/lib/mime";
import type {
  AccessRole,
  FileItemDTO,
  FolderItemDTO,
  ItemDTO,
  PreviewKind,
} from "@/lib/types";

export function previewKindForFile(file: Pick<IFile, "mimeType" | "extension">): PreviewKind {
  if (!canPreviewFile(file.mimeType, file.extension)) return "none";
  if (file.mimeType.startsWith("image/")) return "image";
  if (file.mimeType.startsWith("video/")) return "video";
  if (file.mimeType.startsWith("audio/")) return "audio";
  if (file.mimeType === "application/pdf") return "pdf";
  if (isInlineSafeMime(file.mimeType) || ["json", "csv", "md"].includes(file.extension)) {
    return "text";
  }
  return "none";
}

function baseFields(
  role: AccessRole,
  isStarred: boolean,
  ownerName?: string
) {
  return {
    role,
    isOwner: role === "owner",
    canEdit: role === "owner" || role === "editor",
    canShare: role === "owner",
    canDelete: role === "owner" || role === "editor",
    isStarred,
    ownerName,
  };
}

export function fileToDTO(
  file: IFile,
  role: AccessRole,
  starred: boolean,
  ownerName?: string
): FileItemDTO {
  return {
    id: file._id.toString(),
    type: "file",
    name: file.name,
    parentId: file.parentId?.toString() || null,
    ...baseFields(role, starred, ownerName),
    mimeType: file.mimeType,
    extension: file.extension,
    size: file.size,
    category: categoryForMime(file.mimeType),
    thumbnailStatus: file.thumbnailStatus,
    previewKind: previewKindForFile(file),
    mediaMetadata: file.mediaMetadata
      ? {
          width: file.mediaMetadata.width,
          height: file.mediaMetadata.height,
          durationSeconds: file.mediaMetadata.durationSeconds,
          capturedAt: file.mediaMetadata.capturedAt?.toISOString(),
          hasExif: file.mediaMetadata.hasExif,
          format: file.mediaMetadata.format,
        }
      : undefined,
    deletedAt: file.deletedAt?.toISOString() || null,
    uploadedVia: file.uploadedVia,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

export function folderToDTO(
  folder: IFolder,
  role: AccessRole,
  starred: boolean,
  ownerName?: string
): FolderItemDTO {
  return {
    id: folder._id.toString(),
    type: "folder",
    name: folder.name,
    parentId: folder.parentId?.toString() || null,
    ...baseFields(role, starred, ownerName),
    deletedAt: folder.deletedAt?.toISOString() || null,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

export async function ownerNamesFor(
  userId: string,
  files: IFile[],
  folders: IFolder[]
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const item of [...files, ...folders]) {
    const owner = item.owner.toString();
    if (owner !== userId) ids.add(owner);
  }
  if (ids.size === 0) return new Map();
  const users = await User.find({ _id: { $in: [...ids] } })
    .select("_id name")
    .lean();
  return new Map(users.map((user) => [user._id.toString(), user.name]));
}

export function ownerNameFromMap(
  map: Map<string, string>,
  ownerId: Types.ObjectId
): string | undefined {
  return map.get(ownerId.toString());
}

export function mapItemsToDTO(
  files: IFile[],
  folders: IFolder[],
  roles: Map<string, AccessRole>,
  stars: Set<string>,
  ownerNames: Map<string, string>
): ItemDTO[] {
  const items: ItemDTO[] = [];
  for (const folder of folders) {
    const role = roles.get(`folder:${folder._id}`);
    if (!role) continue;
    items.push(
      folderToDTO(folder, role, stars.has(`folder:${folder._id}`), ownerNameFromMap(ownerNames, folder.owner))
    );
  }
  for (const file of files) {
    const role = roles.get(`file:${file._id}`);
    if (!role) continue;
    items.push(
      fileToDTO(file, role, stars.has(`file:${file._id}`), ownerNameFromMap(ownerNames, file.owner))
    );
  }
  return items;
}
