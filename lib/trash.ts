import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { File } from "@/models/File";
import { Folder } from "@/models/Folder";
import { Share } from "@/models/Share";
import { ShareLink } from "@/models/ShareLink";
import { Star } from "@/models/Star";
import {
  getFileWithAccess,
  getFolderWithAccess,
  requireItemAccess,
} from "@/lib/access";
import { ensureAvailableName } from "@/lib/name-service";
import { nameKey } from "@/lib/file-names";
import { deleteStoredFiles } from "@/lib/file-storage";
import { ApiError } from "@/lib/request";
import type { ItemType } from "@/lib/types";

export async function trashItem(
  userId: string,
  type: ItemType,
  itemId: string
): Promise<void> {
  const access = await requireItemAccess(userId, type, itemId, { minRole: "editor" });
  const now = new Date();
  const trashBatch = randomUUID();

  if (type === "file") {
    await File.updateOne(
      { _id: access.item._id, deletedAt: null },
      {
        $set: {
          deletedAt: now,
          deletedBy: userId,
          trashBatch,
          isTrashRoot: true,
        },
      }
    );
    return;
  }

  const folder = access.item as import("@/models/Folder").IFolder;
  const descendants = await Folder.find({
    deletedAt: null,
    ancestorIds: folder._id,
  })
    .select("_id")
    .lean();
  const folderIds = [folder._id, ...descendants.map((item) => item._id)];

  await Folder.updateMany(
    { _id: { $in: folderIds }, deletedAt: null },
    {
      $set: {
        deletedAt: now,
        deletedBy: userId,
        trashBatch,
        isTrashRoot: false,
      },
    }
  );
  await Folder.updateOne(
    { _id: folder._id },
    { $set: { isTrashRoot: true } }
  );
  await File.updateMany(
    { parentId: { $in: folderIds }, deletedAt: null },
    {
      $set: {
        deletedAt: now,
        deletedBy: userId,
        trashBatch,
        isTrashRoot: false,
      },
    }
  );
}

async function canRestoreIntoParent(userId: string, parentId: string | null): Promise<boolean> {
  if (!parentId) return true;
  const access = await getFolderWithAccess(userId, parentId);
  return Boolean(access && (access.role === "owner" || access.role === "editor"));
}

export async function restoreTrashItem(
  userId: string,
  type: ItemType,
  itemId: string
): Promise<{ parentId: string | null }> {
  const found =
    type === "file"
      ? await getFileWithAccess(userId, itemId, true)
      : await getFolderWithAccess(userId, itemId, true);
  if (!found || !found.item.deletedAt) {
    throw new ApiError(404, "Trashed item not found", "NOT_FOUND");
  }
  if (!found.item.isTrashRoot) {
    throw new ApiError(409, "Restore the parent folder from the recycle bin instead", "NOT_TRASH_ROOT");
  }

  const parentId = found.item.parentId || null;
  const parentAvailable = await canRestoreIntoParent(userId, parentId?.toString() || null);
  if (!parentAvailable && found.item.owner.toString() !== userId) {
    throw new ApiError(
      409,
      "The original folder is unavailable. Ask its owner to restore this shared item.",
      "ORIGINAL_PARENT_UNAVAILABLE"
    );
  }
  const destinationParentId = parentAvailable ? parentId : null;
  const availableName = await ensureAvailableName({
    desiredName: found.item.name,
    parentId: destinationParentId,
    excludeType: type,
    excludeId: found.item._id,
  });

  if (type === "file") {
    await File.updateOne(
      { _id: found.item._id, deletedAt: { $ne: null } },
      {
        $set: {
          deletedAt: null,
          deletedBy: null,
          trashBatch: null,
          isTrashRoot: false,
          parentId: destinationParentId,
          name: availableName,
          nameKey: nameKey(availableName),
        },
      }
    );
    return { parentId: destinationParentId?.toString() || null };
  }

  const folder = found.item as import("@/models/Folder").IFolder;
  if (!folder.trashBatch) {
    throw new ApiError(409, "This folder has no restorable trash batch", "INVALID_TRASH_STATE");
  }
  const [folders, files] = await Promise.all([
    Folder.find({ trashBatch: folder.trashBatch, deletedAt: { $ne: null } }).lean(),
    File.find({ trashBatch: folder.trashBatch, deletedAt: { $ne: null } }).lean(),
  ]);
  if (folders.length === 0) {
    throw new ApiError(404, "Trashed folder not found", "NOT_FOUND");
  }

  let destinationAncestors: Types.ObjectId[] = [];
  if (destinationParentId) {
    const destination = await Folder.findOne({
      _id: destinationParentId,
      deletedAt: null,
    }).lean();
    if (!destination) {
      throw new ApiError(409, "Restore destination no longer exists", "RESTORE_FAILED");
    }
    destinationAncestors = [...destination.ancestorIds, destination._id];
  }

  const descendantFolders = folders.filter(
    (candidate) => candidate._id.toString() !== folder._id.toString()
  );

  await Folder.updateOne(
    { _id: folder._id, deletedAt: { $ne: null } },
    {
      $set: {
        deletedAt: null,
        deletedBy: null,
        trashBatch: null,
        isTrashRoot: false,
        parentId: destinationParentId,
        ancestorIds: destinationAncestors,
        name: availableName,
        nameKey: nameKey(availableName),
      },
    }
  );

  if (descendantFolders.length > 0) {
    const updates = descendantFolders.map((descendant) => {
      const anchoredAt = descendant.ancestorIds.findIndex(
        (ancestor) => ancestor.toString() === folder._id.toString()
      );
      const relative =
        anchoredAt >= 0 ? descendant.ancestorIds.slice(anchoredAt + 1) : [];
      return {
        updateOne: {
          filter: { _id: descendant._id, deletedAt: { $ne: null } },
          update: {
            $set: {
              deletedAt: null,
              deletedBy: null,
              trashBatch: null,
              isTrashRoot: false,
              ancestorIds: [...destinationAncestors, folder._id, ...relative],
            },
          },
        },
      };
    });
    await Folder.bulkWrite(updates, { ordered: false });
  }

  if (files.length > 0) {
    await File.updateMany(
      { _id: { $in: files.map((file) => file._id) }, deletedAt: { $ne: null } },
      {
        $set: {
          deletedAt: null,
          deletedBy: null,
          trashBatch: null,
          isTrashRoot: false,
        },
      }
    );
  }

  return { parentId: destinationParentId?.toString() || null };
}

interface DeletableSet {
  folderIds: Types.ObjectId[];
  fileIds: Types.ObjectId[];
  filePaths: Array<string | null | undefined>;
  thumbnailPaths: Array<string | null | undefined>;
}

async function collectTrashBatch(
  type: ItemType,
  item: import("@/models/File").IFile | import("@/models/Folder").IFolder
): Promise<DeletableSet> {
  if (type === "file") {
    const file = item as import("@/models/File").IFile;
    return {
      folderIds: [],
      fileIds: [file._id],
      filePaths: [file.storageRelPath],
      thumbnailPaths: [file.thumbnailRelPath],
    };
  }

  const folder = item as import("@/models/Folder").IFolder;
  const batchFilter: Record<string, unknown> = folder.trashBatch
    ? { trashBatch: folder.trashBatch, deletedAt: { $ne: null } }
    : { _id: folder._id };
  const [folders, files] = await Promise.all([
    Folder.find(batchFilter).select("_id").lean(),
    File.find(batchFilter).select("_id storageRelPath thumbnailRelPath").lean(),
  ]);
  return {
    folderIds: folders.map((entry) => entry._id),
    fileIds: files.map((entry) => entry._id),
    filePaths: files.map((entry) => entry.storageRelPath),
    thumbnailPaths: files.map((entry) => entry.thumbnailRelPath),
  };
}

export async function permanentlyDeleteTrashItem(
  userId: string,
  type: ItemType,
  itemId: string
): Promise<void> {
  const found =
    type === "file"
      ? await getFileWithAccess(userId, itemId, true)
      : await getFolderWithAccess(userId, itemId, true);
  if (!found || !found.item.deletedAt) {
    throw new ApiError(404, "Trashed item not found", "NOT_FOUND");
  }
  if (found.item.owner.toString() !== userId) {
    throw new ApiError(
      403,
      "Only the owner can permanently delete this item",
      "OWNER_REQUIRED"
    );
  }
  if (!found.item.isTrashRoot) {
    throw new ApiError(409, "Delete the parent folder from the recycle bin instead", "NOT_TRASH_ROOT");
  }

  const set = await collectTrashBatch(type, found.item);
  await deleteStoredFiles([...set.filePaths, ...set.thumbnailPaths]);

  await Promise.all([
    set.folderIds.length
      ? Folder.deleteMany({ _id: { $in: set.folderIds } })
      : Promise.resolve(),
    set.fileIds.length ? File.deleteMany({ _id: { $in: set.fileIds } }) : Promise.resolve(),
    Share.deleteMany({
      $or: [
        { resourceType: "folder", resourceId: { $in: set.folderIds } },
        { resourceType: "file", resourceId: { $in: set.fileIds } },
      ],
    }),
    ShareLink.deleteMany({
      $or: [
        { resourceType: "folder", resourceId: { $in: set.folderIds } },
        { resourceType: "file", resourceId: { $in: set.fileIds } },
      ],
    }),
    Star.deleteMany({
      $or: [
        { itemType: "folder", itemId: { $in: set.folderIds } },
        { itemType: "file", itemId: { $in: set.fileIds } },
      ],
    }),
  ]);
}

export async function purgeExpiredTrashEntry(
  ownerId: string,
  type: ItemType,
  itemId: string
): Promise<void> {
  await permanentlyDeleteTrashItem(ownerId, type, itemId);
}
