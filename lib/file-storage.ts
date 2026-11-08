import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getStoragePath, removeFileIfExists } from "@/lib/storage";
import { ensureDirectory } from "@/lib/storage";
import { logger } from "@/lib/logger";

export function newStorageLocation(ownerId: string): {
  storageName: string;
  storageRelPath: string;
} {
  const now = new Date();
  const storageName = `${randomUUID()}.blob`;
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return {
    storageName,
    storageRelPath: `files/${ownerId}/${year}/${month}/${storageName}`,
  };
}

export function newThumbnailLocation(ownerId: string): {
  filename: string;
  relativePath: string;
} {
  const filename = `${randomUUID()}.webp`;
  return {
    filename,
    relativePath: `thumbnails/${ownerId}/${filename}`,
  };
}

export function newPreviewLocation(ownerId: string): {
  filename: string;
  relativePath: string;
} {
  const filename = `${randomUUID()}.preview`;
  return {
    filename,
    relativePath: `previews/${ownerId}/${filename}`,
  };
}

export async function copyStoredFile(
  sourceRelativePath: string,
  destinationOwnerId: string
): Promise<{ storageName: string; storageRelPath: string; absolutePath: string; size: number }> {
  const source = getStoragePath(sourceRelativePath);
  const location = newStorageLocation(destinationOwnerId);
  const destination = getStoragePath(location.storageRelPath);
  await ensureDirectory(path.posix.dirname(location.storageRelPath));
  await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
  const stat = await fsp.stat(destination);
  return {
    ...location,
    absolutePath: destination,
    size: stat.size,
  };
}

export async function copyThumbnailFile(
  sourceRelativePath: string | null | undefined,
  destinationOwnerId: string
): Promise<string | null> {
  if (!sourceRelativePath) return null;
  try {
    const source = getStoragePath(sourceRelativePath);
    await fsp.access(source);
    const location = newThumbnailLocation(destinationOwnerId);
    await ensureDirectory(path.posix.dirname(location.relativePath));
    await fsp.copyFile(source, getStoragePath(location.relativePath), fs.constants.COPYFILE_EXCL);
    return location.relativePath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    logger.warn("Unable to copy thumbnail", { error });
    return null;
  }
}

export async function deleteStoredFile(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  await removeFileIfExists(getStoragePath(relativePath));
}

export async function deleteStoredFiles(relativePaths: Array<string | null | undefined>): Promise<void> {
  const unique = [...new Set(relativePaths.filter((value): value is string => Boolean(value)))];
  const results = await Promise.allSettled(unique.map((relativePath) => deleteStoredFile(relativePath)));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    throw new Error(`Failed to remove ${failures.length} stored file(s)`);
  }
}
