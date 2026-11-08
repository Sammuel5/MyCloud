import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getStorageRoot } from "@/lib/config";

export const STORAGE_DIRECTORIES = ["files", "thumbnails", "previews", "temp"] as const;

export class UnsafeStoragePathError extends Error {
  constructor(message = "Unsafe storage path") {
    super(message);
    this.name = "UnsafeStoragePathError";
  }
}

/**
 * Resolves a *server-generated* relative path beneath a storage root.
 * User input must never be passed here directly.
 */
export function resolveWithinRoot(root: string, relativePath: string): string {
  if (!relativePath || relativePath.includes("\0")) {
    throw new UnsafeStoragePathError();
  }
  const normalized = relativePath.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new UnsafeStoragePathError();
  }
  const rootResolved = path.resolve(root);
  const target = path.resolve(rootResolved, ...normalized.split("/").filter(Boolean));
  const relative = path.relative(rootResolved, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new UnsafeStoragePathError();
  }
  return target;
}

export function storageRelativeFromAbsolute(root: string, absolutePath: string): string {
  const rootResolved = path.resolve(root);
  const target = path.resolve(absolutePath);
  const relative = path.relative(rootResolved, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new UnsafeStoragePathError("Path is outside the storage root");
  }
  return relative.split(path.sep).join("/");
}

export function getStoragePath(relativePath: string): string {
  return resolveWithinRoot(getStorageRoot(), relativePath);
}

export async function ensureStorageLayout(): Promise<string> {
  const root = getStorageRoot();
  await fsp.mkdir(root, { recursive: true });
  for (const directory of STORAGE_DIRECTORIES) {
    await fsp.mkdir(path.join(root, directory), { recursive: true });
  }
  return root;
}

export async function ensureDirectory(relativeDirectory: string): Promise<string> {
  const root = await ensureStorageLayout();
  const absolute = resolveWithinRoot(root, relativeDirectory);
  await fsp.mkdir(absolute, { recursive: true });
  return absolute;
}

export async function removeFileIfExists(absolutePath: string): Promise<void> {
  try {
    await fsp.unlink(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function removeEmptyDirectory(absolutePath: string): Promise<void> {
  try {
    await fsp.rm(absolutePath, { recursive: true, force: true });
  } catch {
    // Cleanup is best-effort; the maintenance worker retries orphan cleanup.
  }
}

export async function pathIsFile(absolutePath: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(absolutePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export interface DiskSpace {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
}

export async function getDiskSpace(): Promise<DiskSpace> {
  const root = await ensureStorageLayout();
  const stats = await fsp.statfs(root);
  const totalBytes = Number(stats.bsize) * Number(stats.blocks);
  const freeBytes = Number(stats.bsize) * Number(stats.bavail);
  return {
    totalBytes,
    freeBytes,
    usedBytes: Math.max(0, totalBytes - freeBytes),
  };
}

export async function assertSufficientDiskSpace(requiredBytes: number): Promise<void> {
  const { freeBytes } = await getDiskSpace();
  const safetyReserve = Math.min(2 * 1024 ** 3, Math.max(256 * 1024 ** 2, requiredBytes * 0.05));
  if (freeBytes < requiredBytes + safetyReserve) {
    const error = new Error("Storage volume does not have enough free space") as NodeJS.ErrnoException;
    error.code = "ENOSPC";
    throw error;
  }
}

export async function moveFile(source: string, destination: string, overwrite = false): Promise<void> {
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  if (!overwrite) {
    try {
      await fsp.access(destination, fs.constants.F_OK);
      throw new Error("Destination already exists");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  try {
    await fsp.rename(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fsp.copyFile(source, destination);
    await fsp.unlink(source);
  }
}

export async function storageHealth(): Promise<{
  ok: boolean;
  writable: boolean;
  error?: string;
}> {
  try {
    const root = await ensureStorageLayout();
    const probe = path.join(root, "temp", `.health-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await fsp.writeFile(probe, "ok", { flag: "wx" });
    await fsp.unlink(probe);
    return { ok: true, writable: true };
  } catch (error) {
    return {
      ok: false,
      writable: false,
      error: error instanceof Error ? error.message : "Storage unavailable",
    };
  }
}
