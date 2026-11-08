import fsp from "node:fs/promises";
import { getExtension } from "@/lib/file-names";
import {
  extensionCategory,
  isDangerousExtension,
  isDangerousMime,
  isExtensionAllowed,
  isMimeCompatibleWithExtension,
  mimeForExtension,
  safeMimeForServing,
} from "@/lib/mime";
import { ApiError } from "@/lib/request";

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json"]);

export interface ValidatedFileType {
  mimeType: string;
  extension: string;
  detected: boolean;
  format?: string;
}

async function detectContainer(filePath: string): Promise<{ mime: string; ext: string } | null> {
  try {
    const { fileTypeFromFile } = await import("file-type");
    const detected = await fileTypeFromFile(filePath);
    return detected ? { mime: detected.mime, ext: detected.ext } : null;
  } catch {
    return null;
  }
}

async function looksLikeText(filePath: string, size: number): Promise<boolean> {
  if (size === 0) return true;
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(size, 64 * 1024));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const sample = buffer.subarray(0, bytesRead);
    if (sample.includes(0)) return false;
    const text = sample.toString("utf8");
    if (text.includes("\uFFFD")) return false;
    return true;
  } finally {
    await handle.close();
  }
}

export async function validateStoredUpload(
  absolutePath: string,
  filename: string,
  claimedMime: string,
  size: number
): Promise<ValidatedFileType> {
  const extension = getExtension(filename);
  if (!extension) {
    throw new ApiError(
      415,
      "Files must have a supported extension. Ask the administrator to allow additional types.",
      "FILE_TYPE_NOT_ALLOWED"
    );
  }
  if (isDangerousExtension(extension) || !isExtensionAllowed(extension)) {
    throw new ApiError(415, "This file type is not allowed.", "FILE_TYPE_NOT_ALLOWED");
  }

  const expectedMime = mimeForExtension(extension);
  if (!expectedMime) {
    throw new ApiError(415, "This file type is not allowed.", "FILE_TYPE_NOT_ALLOWED");
  }

  const detected = await detectContainer(absolutePath);
  let mimeType = expectedMime;
  let detectedFormat: string | undefined;
  let wasDetected = false;

  if (detected) {
    wasDetected = true;
    detectedFormat = detected.ext;
    if (detected.mime === "application/zip" && expectedMime.includes("officedocument")) {
      mimeType = expectedMime;
    } else {
      if (
        !isMimeCompatibleWithExtension(extension, detected.mime, claimedMime || expectedMime)
      ) {
        throw new ApiError(
          415,
          "The file's actual content does not match its extension.",
          "FILE_TYPE_MISMATCH"
        );
      }
      mimeType = detected.mime;
    }
  } else if (size === 0) {
    mimeType = expectedMime;
  } else if (TEXT_EXTENSIONS.has(extension) && (await looksLikeText(absolutePath, size))) {
    mimeType = expectedMime;
  } else {
    throw new ApiError(
      415,
      "The file content could not be verified as a supported format.",
      "UNRECOGNIZED_FILE_TYPE"
    );
  }

  if (isDangerousMime(mimeType)) {
    throw new ApiError(415, "This file type is not allowed.", "FILE_TYPE_NOT_ALLOWED");
  }
  if (!extensionCategory(extension)) {
    throw new ApiError(415, "This file type is not allowed.", "FILE_TYPE_NOT_ALLOWED");
  }

  return {
    mimeType: safeMimeForServing(mimeType),
    extension,
    detected: wasDetected,
    format: detectedFormat,
  };
}
