import { Types } from "mongoose";
import { Folder } from "@/models/Folder";
import { File } from "@/models/File";
import { Star } from "@/models/Star";
import { Share } from "@/models/Share";
import {
  getAccessibleQueryContext,
  requireItemAccess,
  resolveItemRoles,
  getFolderWithAccess,
} from "@/lib/access";
import { ensureAvailableName, ensureFileExtensionPreserved } from "@/lib/name-service";
import { nameKey, sanitizeDisplayName } from "@/lib/file-names";
import { ApiError } from "@/lib/request";
import type { AccessRole, ItemDTO } from "@/lib/types";
import { folderToDTO, fileToDTO } from "@/lib/item-dto";
import { getItemDetails } from "@/lib/items";
import { getStarredIds } from "@/lib/access";

export async function createFolder(
  userId: string,
  input: { name: string; parentId?: string | null }
): Promise<ItemDTO> {
  const parentId = input.parentId ? new Types.ObjectId(input.parentId) : null;
  let ancestorIds: Types.ObjectId[] = [];

  if (parentId) {
    const parentAccess = await requireItemAccess(userId, "folder", parentId.toString(), {
      minRole: "editor",
    });
    if (parentAccess.item.deletedAt) throw new ApiError(409, "Parent folder is in the trash");
    ancestorIds = [
      ...(parentAccess.item as import("@/models/Folder").IFolder).ancestorIds,
      parentAccess.item._id,
    ];
  }

  const name = sanitizeDisplayName(input.name, "New folder");
  const availableName = await ensureAvailableName({ desiredName: name, parentId });

  const folder = await Folder.create({
    owner: userId,
    name: availableName,
    nameKey: nameKey(availableName),
    parentId,
    ancestorIds,
  });

  return folderToDTO(folder.toObject(), "owner", false);
}

export async function renameItem(
  userId: string,
  type: "file" | "folder",
  itemId: string,
  proposedName: string
): Promise<ItemDTO> {
  const access = await requireItemAccess(userId, type, itemId, { minRole: "editor" });
  const sanitized = sanitizeDisplayName(proposedName);
  const finalName =
    type === "file"
      ? await ensureFileExtensionPreserved(access.item.name, sanitized)
      : sanitized;

  const available = await ensureAvailableName({
    desiredName: finalName,
    parentId: access.item.parentId,
    excludeType: type,
    excludeId: access.item._id,
  });

  if (type === "file") {
    await File.updateOne(
      { _id: access.item._id },
      { $set: { name: available, nameKey: nameKey(available) } }
    );
  } else {
    await Folder.updateOne(
      { _id: access.item._id },
      { $set: { name: available, nameKey: nameKey(available) } }
    );
  }
  return getItemDetails(userId, type, itemId);
}

export async function moveItem(
  userId: string,
  type: "file" | "folder",
  itemId: string,
  destinationParentId: string | null
): Promise<ItemDTO> {
  const access = await requireItemAccess(userId, type, itemId, { minRole: "editor" });
  const destinationId = destinationParentId ? new Types.ObjectId(destinationParentId) : null;

  if (access.item.parentId?.toString() === destinationId?.toString()) {
    // Still normalize a requested display rename through the name allocator,
    // but moving into the same parent is otherwise a no-op.
    return getItemDetails(userId, type, itemId);
  }

  let destinationFolder = null;
  let destinationAncestors: Types.ObjectId[] = [];
  if (destinationId) {
    const destinationAccess = await requireItemAccess(
      userId,
      "folder",
      destinationId.toString(),
      { minRole: "editor" }
    );
    if (destinationAccess.item.deletedAt) {
      throw new ApiError(409, "Destination folder is in the trash");
    }
    const destinationItem = destinationAccess.item as import("@/models/Folder").IFolder;
    destinationFolder = destinationItem;
    destinationAncestors = [
      ...destinationItem.ancestorIds,
      destinationItem._id,
    ];

    if (type === "folder") {
      const sourceFolder = access.item as import("@/models/Folder").IFolder;
      if (
        destinationAccess.item._id.toString() === sourceFolder._id.toString() ||
        sourceFolder.ancestorIds.some(
          (ancestor) => ancestor.toString() === destinationAccess.item._id.toString()
        )
      ) {
        throw new ApiError(400, "A folder cannot be moved inside itself", "INVALID_MOVE");
      }
    }
  }

  const available = await ensureAvailableName({
    desiredName: access.item.name,
    parentId: destinationId,
    excludeType: type,
    excludeId: access.item._id,
  });

  if (type === "file") {
    await File.updateOne(
      { _id: access.item._id },
      {
        $set: {
          parentId: destinationId,
          name: available,
          nameKey: nameKey(available),
        },
      }
    );
    return getItemDetails(userId, type, itemId);
  }

  const folder = access.item as import("@/models/Folder").IFolder;
  const oldAncestors = [...folder.ancestorIds, folder._id];

  const descendants = await Folder.find({
    ancestorIds: folder._id,
    _id: { $ne: folder._id },
  })
    .select("_id ancestorIds")
    .lean();

  const bulkOps = descendants
    .map((descendant) => {
      const index = descendant.ancestorIds.findIndex(
        (ancestor) => ancestor.toString() === folder._id.toString()
      );
      if (index < 0) return null;
      const relativeAncestors = descendant.ancestorIds.slice(index + 1);
      const newAncestorIds = [
        ...destinationAncestors,
        folder._id,
        ...relativeAncestors,
      ];
      return {
        updateOne: {
          filter: { _id: descendant._id },
          update: { $set: { ancestorIds: newAncestorIds } },
        },
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  await Folder.updateOne(
    { _id: folder._id },
    {
      $set: {
        parentId: destinationId,
        ancestorIds: destinationAncestors,
        name: available,
        nameKey: nameKey(available),
      },
    }
  );

  if (bulkOps.length > 0) await Folder.bulkWrite(bulkOps, { ordered: false });
  if (oldAncestors.length === 0) {
    // Unreachable safeguard: oldAncestors always includes the folder itself.
    throw new Error("Invalid folder ancestry state");
  }

  return getItemDetails(userId, type, itemId);
}

export async function toggleStar(
  userId: string,
  type: "file" | "folder",
  itemId: string,
  starred: boolean
): Promise<boolean> {
  await requireItemAccess(userId, type, itemId);
  if (starred) {
    await Star.updateOne(
      { userId, itemType: type, itemId },
      { $setOnInsert: { userId, itemType: type, itemId } },
      { upsert: true }
    );
  } else {
    await Star.deleteOne({ userId, itemType: type, itemId });
  }
  return starred;
}

export interface FolderTreeEntry {
  id: string;
  name: string;
  parentId: string | null;
  role: AccessRole;
}

export async function getFolderPickerTree(
  userId: string,
  excludeFolderId?: string
): Promise<FolderTreeEntry[]> {
  const context = await getAccessibleQueryContext(userId);
  const folders = await Folder.find({
    deletedAt: null,
    $and: [context.folderFilter],
  })
    .sort({ nameKey: 1 })
    .limit(5000)
    .lean();
  const files: never[] = [];
  const roles = await resolveItemRoles(userId, folders, files);
  const excluded = new Set<string>();
  if (excludeFolderId) {
    excluded.add(excludeFolderId);
    const descendants = await Folder.find({ ancestorIds: excludeFolderId })
      .select("_id")
      .lean();
    for (const folder of descendants) excluded.add(folder._id.toString());
  }
  return folders
    .filter((folder) => {
      const role = roles.get(`folder:${folder._id}`);
      return (
        (role === "owner" || role === "editor") && !excluded.has(folder._id.toString())
      );
    })
    .map((folder) => ({
      id: folder._id.toString(),
      name: folder.name,
      parentId: folder.parentId?.toString() || null,
      role: roles.get(`folder:${folder._id}`) as AccessRole,
    }));
}

export async function getFolderShareStatus(
  userId: string,
  folderId: string
): Promise<{ collaborators: number; links: number }> {
  const access = await getFolderWithAccess(userId, folderId);
  if (!access || access.role !== "owner") {
    return { collaborators: 0, links: 0 };
  }
  const [collaborators, links] = await Promise.all([
    Share.countDocuments({ resourceType: "folder", resourceId: folderId }),
    import("@/models/ShareLink").then(({ ShareLink }) =>
      ShareLink.countDocuments({
        resourceType: "folder",
        resourceId: folderId,
        revokedAt: null,
      })
    ),
  ]);
  return { collaborators, links };
}

export async function getItemStarStatus(
  userId: string,
  type: "file" | "folder",
  itemId: string
): Promise<boolean> {
  const stars = await Star.exists({ userId, itemType: type, itemId });
  return Boolean(stars);
}
