import { Types } from "mongoose";
import path from "node:path";
import { File } from "@/models/File";
import { Folder } from "@/models/Folder";
import { copyName, nameKey, numberedName, sanitizeDisplayName } from "@/lib/file-names";
import { ApiError } from "@/lib/request";

export type NameStrategy = "numbered" | "copy";

interface EnsureNameOptions {
  desiredName: string;
  parentId: Types.ObjectId | string | null;
  strategy?: NameStrategy;
  excludeType?: "file" | "folder";
  excludeId?: Types.ObjectId | string;
}

function candidateName(desired: string, strategy: NameStrategy, attempt: number): string {
  if (attempt === 1) return sanitizeDisplayName(desired);
  if (strategy === "copy") return copyName(desired, attempt);
  return numberedName(desired, attempt);
}

export async function ensureAvailableName(options: EnsureNameOptions): Promise<string> {
  const strategy = options.strategy || "numbered";
  const parentId = options.parentId ? new Types.ObjectId(options.parentId.toString()) : null;
  const excludeId = options.excludeId
    ? new Types.ObjectId(options.excludeId.toString())
    : undefined;

  for (let attempt = 1; attempt <= 500; attempt++) {
    const proposed = candidateName(options.desiredName, strategy, attempt);
    const proposedKey = nameKey(proposed);
    const [fileExists, folderExists] = await Promise.all([
      File.exists({
        parentId,
        nameKey: proposedKey,
        deletedAt: null,
        ...(options.excludeType === "folder" || !excludeId ? {} : { _id: { $ne: excludeId } }),
      }),
      Folder.exists({
        parentId,
        nameKey: proposedKey,
        deletedAt: null,
        ...(options.excludeType === "file" || !excludeId ? {} : { _id: { $ne: excludeId } }),
      }),
    ]);
    if (!fileExists && !folderExists) return proposed;
  }
  throw new ApiError(409, "Could not allocate a unique filename", "NAME_CONFLICT");
}

export async function ensureFileExtensionPreserved(
  currentName: string,
  proposedName: string
): Promise<string> {
  const currentExtension = path.extname(currentName);
  const proposedExtension = path.extname(proposedName);
  if (currentExtension.toLowerCase() !== proposedExtension.toLowerCase()) {
    throw new ApiError(
      400,
      "Renaming a file cannot change its extension. The file type remains fixed after upload.",
      "EXTENSION_CHANGE_NOT_ALLOWED"
    );
  }
  return proposedName;
}
