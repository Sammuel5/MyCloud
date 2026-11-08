import { Types } from "mongoose";
import { File, type IFile } from "@/models/File";
import { Folder, type IFolder } from "@/models/Folder";
import { requireItemAccess } from "@/lib/access";
import { ensureAvailableName } from "@/lib/name-service";
import { nameKey, sanitizeDisplayName } from "@/lib/file-names";
import { assertWithinQuota } from "@/lib/usage";
import { assertSufficientDiskSpace } from "@/lib/storage";
import {
  copyStoredFile,
  copyThumbnailFile,
  deleteStoredFile,
} from "@/lib/file-storage";
import { enqueueThumbnailJob, fileNeedsThumbnail } from "@/lib/jobs";
import { ApiError } from "@/lib/request";
import { getItemDetails } from "@/lib/items";
import type { ItemDTO, ItemType } from "@/lib/types";

interface CreatedCopy {
  folderIds: Types.ObjectId[];
  fileIds: Types.ObjectId[];
  filePaths: string[];
  thumbnailPaths: string[];
}

async function destinationInfo(
  userId: string,
  destinationParentId: string | null
): Promise<{ id: Types.ObjectId | null; ancestors: Types.ObjectId[] }> {
  if (!destinationParentId) return { id: null, ancestors: [] };
  const access = await requireItemAccess(userId, "folder", destinationParentId, {
    minRole: "editor",
  });
  const folder = access.item as IFolder;
  return {
    id: folder._id,
    ancestors: [...folder.ancestorIds, folder._id],
  };
}

async function cleanupCopy(created: CreatedCopy): Promise<void> {
  await Promise.allSettled([
    created.folderIds.length
      ? Folder.deleteMany({ _id: { $in: created.folderIds } })
      : Promise.resolve(),
    created.fileIds.length
      ? File.deleteMany({ _id: { $in: created.fileIds } })
      : Promise.resolve(),
    ...[...created.filePaths, ...created.thumbnailPaths].map((relative) =>
      deleteStoredFile(relative)
    ),
  ]);
}

export async function copyItem(
  userId: string,
  type: ItemType,
  itemId: string,
  destinationParentId: string | null,
  quotaBytes: number
): Promise<ItemDTO> {
  const source = await requireItemAccess(userId, type, itemId, { minRole: "viewer" });
  const destination = await destinationInfo(userId, destinationParentId);

  if (type === "folder") {
    const sourceFolder = source.item as IFolder;
    if (
      destination.id &&
      (destination.id.toString() === sourceFolder._id.toString() ||
        sourceFolder.ancestorIds.some(
          (ancestor) => ancestor.toString() === destination.id?.toString()
        ))
    ) {
      throw new ApiError(400, "This folder cannot be copied into itself", "INVALID_COPY");
    }
  }

  const newName = await ensureAvailableName({
    desiredName: source.item.name,
    parentId: destination.id,
    strategy: "copy",
  });

  if (type === "file") {
    const file = source.item as IFile;
    await assertWithinQuota(userId, quotaBytes, file.size);
    await assertSufficientDiskSpace(file.size);
    const copied = await copyStoredFile(file.storageRelPath, userId);
    let thumbnailRelPath: string | null = null;
    const created: CreatedCopy = {
      folderIds: [],
      fileIds: [],
      filePaths: [copied.storageRelPath],
      thumbnailPaths: [],
    };
    try {
      thumbnailRelPath = await copyThumbnailFile(file.thumbnailRelPath, userId);
      if (thumbnailRelPath) created.thumbnailPaths.push(thumbnailRelPath);
      const newFile = await File.create({
        owner: userId,
        name: newName,
        nameKey: nameKey(newName),
        parentId: destination.id,
        storageName: copied.storageName,
        storageRelPath: copied.storageRelPath,
        mimeType: file.mimeType,
        extension: file.extension,
        size: copied.size,
        checksumSha256: file.checksumSha256,
        mediaMetadata: file.mediaMetadata,
        thumbnailStatus: thumbnailRelPath
          ? "ready"
          : fileNeedsThumbnail(file)
            ? "pending"
            : "not_applicable",
        thumbnailRelPath,
        previewStatus: file.previewStatus,
        uploadedVia: file.uploadedVia,
      });
      created.fileIds.push(newFile._id);
      if (!thumbnailRelPath && fileNeedsThumbnail(file)) {
        await enqueueThumbnailJob(newFile);
      }
      return getItemDetails(userId, "file", newFile._id.toString());
    } catch (error) {
      await cleanupCopy(created);
      throw error;
    }
  }

  const folder = source.item as IFolder;
  const descendantFolders = await Folder.find({
    deletedAt: null,
    ancestorIds: folder._id,
  })
    .select("_id name parentId ancestorIds")
    .lean();
  const sourceFolderIds = [folder._id, ...descendantFolders.map((entry) => entry._id)];
  const sourceFiles = await File.find({
    deletedAt: null,
    parentId: { $in: sourceFolderIds },
  }).lean();

  const totalSize = sourceFiles.reduce((sum, file) => sum + file.size, 0);
  await assertWithinQuota(userId, quotaBytes, totalSize);
  await assertSufficientDiskSpace(totalSize);

  const created: CreatedCopy = {
    folderIds: [],
    fileIds: [],
    filePaths: [],
    thumbnailPaths: [],
  };

  try {
    const newRoot = await Folder.create({
      owner: userId,
      name: newName,
      nameKey: nameKey(newName),
      parentId: destination.id,
      ancestorIds: destination.ancestors,
    });
    created.folderIds.push(newRoot._id);
    const folderMap = new Map<string, IFolder>([[folder._id.toString(), newRoot.toObject()]]);

    const orderedFolders = [...descendantFolders].sort(
      (a, b) => a.ancestorIds.length - b.ancestorIds.length
    );
    for (const sourceFolder of orderedFolders) {
      const newParent = sourceFolder.parentId
        ? folderMap.get(sourceFolder.parentId.toString())
        : undefined;
      if (!newParent) throw new Error("Inconsistent source folder hierarchy");
      const cleanName = sanitizeDisplayName(sourceFolder.name, "Folder");
      const clone = await Folder.create({
        owner: userId,
        name: cleanName,
        nameKey: nameKey(cleanName),
        parentId: newParent._id,
        ancestorIds: [...newParent.ancestorIds, newParent._id],
      });
      created.folderIds.push(clone._id);
      folderMap.set(sourceFolder._id.toString(), clone.toObject());
    }

    for (const sourceFile of sourceFiles) {
      if (!sourceFile.parentId) throw new Error("Inconsistent source file hierarchy");
      const newParent = folderMap.get(sourceFile.parentId.toString());
      if (!newParent) throw new Error("Inconsistent source folder hierarchy");

      const copied = await copyStoredFile(sourceFile.storageRelPath, userId);
      created.filePaths.push(copied.storageRelPath);
      let thumbnailRelPath: string | null = null;
      try {
        thumbnailRelPath = await copyThumbnailFile(sourceFile.thumbnailRelPath, userId);
        if (thumbnailRelPath) created.thumbnailPaths.push(thumbnailRelPath);

        const cleanName = sanitizeDisplayName(sourceFile.name, "File");
        const clone = await File.create({
          owner: userId,
          name: cleanName,
          nameKey: nameKey(cleanName),
          parentId: newParent._id,
          storageName: copied.storageName,
          storageRelPath: copied.storageRelPath,
          mimeType: sourceFile.mimeType,
          extension: sourceFile.extension,
          size: copied.size,
          checksumSha256: sourceFile.checksumSha256,
          mediaMetadata: sourceFile.mediaMetadata,
          thumbnailStatus: thumbnailRelPath
            ? "ready"
            : fileNeedsThumbnail(sourceFile)
              ? "pending"
              : "not_applicable",
          thumbnailRelPath,
          previewStatus: sourceFile.previewStatus,
          uploadedVia: sourceFile.uploadedVia,
        });
        created.fileIds.push(clone._id);
        if (!thumbnailRelPath && fileNeedsThumbnail(sourceFile)) {
          await enqueueThumbnailJob(clone);
        }
      } catch (error) {
        await deleteStoredFile(copied.storageRelPath);
        throw error;
      }
    }

    return getItemDetails(userId, "folder", newRoot._id.toString());
  } catch (error) {
    await cleanupCopy(created);
    throw error;
  }
}
