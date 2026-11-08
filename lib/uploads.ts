import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import {
  getChunkSizeBytes,
  getMaxUploadBytes,
  getTempUploadHours,
} from "@/lib/config";
import {
  getStoragePath,
  ensureDirectory,
  assertSufficientDiskSpace,
  moveFile,
  removeFileIfExists,
} from "@/lib/storage";
import { getExtension, nameKey, sanitizeDisplayName } from "@/lib/file-names";
import { isDangerousExtension, isExtensionAllowed } from "@/lib/mime";
import { ensureAvailableName } from "@/lib/name-service";
import { validateStoredUpload } from "@/lib/file-validation";
import { assertWithinQuota } from "@/lib/usage";
import { getFolderWithAccess } from "@/lib/access";
import { newStorageLocation } from "@/lib/file-storage";
import { enqueueThumbnailJob, fileNeedsThumbnail } from "@/lib/jobs";
import { ApiError } from "@/lib/request";
import { UploadSession } from "@/models/UploadSession";
import { File } from "@/models/File";
import { Folder } from "@/models/Folder";
import { fileToDTO } from "@/lib/item-dto";
import type { UploadCompleteResponse, UploadInitResponse } from "@/lib/types";
import { logger } from "@/lib/logger";

function expiryDate(): Date {
  return new Date(Date.now() + getTempUploadHours() * 60 * 60 * 1000);
}

function partFileName(index: number): string {
  return `part-${String(index).padStart(6, "0")}`;
}

function expectedPartSize(sessionSize: number, chunkSize: number, index: number): number {
  const start = index * chunkSize;
  return Math.max(0, Math.min(chunkSize, sessionSize - start));
}

async function verifyReceivedChunks(session: {
  tempRelPath: string;
  size: number;
  chunkSize: number;
  receivedChunks: number[];
}): Promise<number[]> {
  const directory = getStoragePath(session.tempRelPath);
  const valid: number[] = [];
  for (const index of session.receivedChunks) {
    const partPath = path.join(directory, partFileName(index));
    try {
      const stat = await fsp.stat(partPath);
      if (stat.isFile() && stat.size === expectedPartSize(session.size, session.chunkSize, index)) {
        valid.push(index);
      }
    } catch {
      // A missing part is simply re-uploaded by the client.
    }
  }
  return valid;
}

async function parentIsEditable(
  userId: string,
  parentId: Types.ObjectId | null
): Promise<boolean> {
  if (!parentId) return true;
  const access = await getFolderWithAccess(userId, parentId.toString());
  return Boolean(access && (access.role === "owner" || access.role === "editor"));
}

export interface UploadInitInput {
  filename: string;
  size: number;
  mimeType: string;
  parentId?: string | null;
  fingerprint: string;
}

export async function initUpload(
  userId: string,
  input: UploadInitInput
): Promise<UploadInitResponse> {
  await connectDB();
  const maxUploadBytes = getMaxUploadBytes();
  if (input.size > maxUploadBytes) {
    throw new ApiError(
      413,
      `This file exceeds the ${(maxUploadBytes / 1024 ** 3).toFixed(1)} GB upload limit.`,
      "UPLOAD_TOO_LARGE"
    );
  }

  const filename = sanitizeDisplayName(input.filename);
  const extension = getExtension(filename);
  if (!extension || !isExtensionAllowed(extension) || isDangerousExtension(extension)) {
    throw new ApiError(415, "This file type is not allowed.", "FILE_TYPE_NOT_ALLOWED");
  }

  const parentId = input.parentId ? input.parentId : null;
  const parentObjectId = parentId
    ? new (await import("mongoose")).Types.ObjectId(parentId)
    : null;
  if (!(await parentIsEditable(userId, parentObjectId))) {
    throw new ApiError(403, "You cannot upload to that folder.", "FORBIDDEN");
  }

  const existing = await UploadSession.findOne({
    owner: userId,
    parentId: parentObjectId,
    filename,
    size: input.size,
    fingerprint: input.fingerprint,
    status: "uploading",
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (existing) {
    const validChunks = await verifyReceivedChunks(existing);
    if (validChunks.length !== existing.receivedChunks.length) {
      await UploadSession.updateOne(
        { _id: existing._id },
        { $set: { receivedChunks: validChunks } }
      );
    }
    existing.receivedChunks = validChunks;
    existing.expiresAt = expiryDate();
    existing.lastActivityAt = new Date();
    await existing.save();
    return {
      uploadId: existing.uploadId,
      chunkSize: existing.chunkSize,
      totalChunks: existing.totalChunks,
      receivedChunks: validChunks,
      resumed: true,
      expiresAt: existing.expiresAt.toISOString(),
      filename: existing.filename,
      maxUploadBytes,
    };
  }

  const user = await import("@/models/User").then(({ User }) => User.findById(userId).lean());
  if (!user) throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
  await assertWithinQuota(userId, user.storageQuotaBytes, input.size);
  await assertSufficientDiskSpace(input.size);

  const chunkSize = getChunkSizeBytes();
  const totalChunks = Math.max(1, Math.ceil(input.size / chunkSize));
  if (totalChunks > 200_000) {
    throw new ApiError(413, "File has too many chunks; increase MYCLOUD_CHUNK_SIZE_BYTES.", "UPLOAD_TOO_LARGE");
  }
  const uploadId = randomUUID();
  const tempRelPath = `temp/uploads/${userId}/${uploadId}`;
  await ensureDirectory(tempRelPath);

  const session = await UploadSession.create({
    uploadId,
    owner: userId,
    fingerprint: input.fingerprint,
    filename,
    nameKey: nameKey(filename),
    mimeType: input.mimeType.slice(0, 255) || "application/octet-stream",
    extension,
    size: input.size,
    parentId: parentObjectId,
    chunkSize,
    totalChunks,
    receivedChunks: [],
    tempRelPath,
    status: "uploading",
    expiresAt: expiryDate(),
    lastActivityAt: new Date(),
  });

  return {
    uploadId: session.uploadId,
    chunkSize: session.chunkSize,
    totalChunks: session.totalChunks,
    receivedChunks: [],
    resumed: false,
    expiresAt: session.expiresAt.toISOString(),
    filename: session.filename,
    maxUploadBytes,
  };
}

export async function getUploadStatus(
  userId: string,
  uploadId: string
): Promise<{
  uploadId: string;
  status: string;
  receivedChunks: number[];
  totalChunks: number;
  chunkSize: number;
  expiresAt: string;
  completedFileId?: string | null;
}> {
  const session = await UploadSession.findOne({ uploadId, owner: userId }).lean();
  if (!session) throw new ApiError(404, "Upload session not found", "NOT_FOUND");
  const validChunks = await verifyReceivedChunks(session);
  return {
    uploadId: session.uploadId,
    status: session.status,
    receivedChunks: validChunks,
    totalChunks: session.totalChunks,
    chunkSize: session.chunkSize,
    expiresAt: session.expiresAt.toISOString(),
    completedFileId: session.completedFileId?.toString() || null,
  };
}

export async function writeUploadChunk(
  userId: string,
  uploadId: string,
  index: number,
  request: Request
): Promise<{ received: boolean; index: number }> {
  const session = await UploadSession.findOne({
    uploadId,
    owner: userId,
    status: "uploading",
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) {
    throw new ApiError(404, "Upload session not found or expired", "NOT_FOUND");
  }
  if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
    throw new ApiError(400, "Invalid chunk index", "INVALID_CHUNK");
  }

  const expected = expectedPartSize(session.size, session.chunkSize, index);
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw new ApiError(400, "Invalid Content-Length", "INVALID_CHUNK");
    }
    if (contentLength > expected) {
      throw new ApiError(413, "Chunk is larger than expected", "CHUNK_TOO_LARGE");
    }
  }

  const directory = getStoragePath(session.tempRelPath);
  await fsp.mkdir(directory, { recursive: true });
  const partPath = path.join(directory, partFileName(index));
  const incomingPath = path.join(directory, `.incoming-${index}-${randomUUID()}`);

  if (expected === 0) {
    await fsp.writeFile(incomingPath, Buffer.alloc(0), { flag: "wx" });
    await removeFileIfExists(partPath);
    await fsp.rename(incomingPath, partPath);
    await UploadSession.updateOne(
      { _id: session._id, status: "uploading" },
      {
        $addToSet: { receivedChunks: index },
        $set: { lastActivityAt: new Date(), expiresAt: expiryDate() },
      }
    );
    return { received: true, index };
  }

  if (!request.body) {
    throw new ApiError(400, "Chunk body is required", "INVALID_CHUNK");
  }

  let bytesWritten = 0;
  const nodeStream = Readable.fromWeb(
    request.body as import("stream/web").ReadableStream<Uint8Array>
  );
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      bytesWritten += buffer.length;
      if (bytesWritten > expected) {
        callback(new ApiError(413, "Chunk is larger than expected", "CHUNK_TOO_LARGE"));
        return;
      }
      callback(null, buffer);
    },
  });
  try {
    await pipeline(
      nodeStream,
      counter,
      fs.createWriteStream(incomingPath, { flags: "wx", highWaterMark: 1024 * 1024 })
    );
  } catch (error) {
    await removeFileIfExists(incomingPath);
    throw error;
  }

  if (bytesWritten !== expected) {
    await removeFileIfExists(incomingPath);
    throw new ApiError(
      400,
      `Chunk size mismatch: expected ${expected} bytes, received ${bytesWritten}`,
      "CHUNK_SIZE_MISMATCH"
    );
  }

  await removeFileIfExists(partPath);
  await fsp.rename(incomingPath, partPath);
  await UploadSession.updateOne(
    { _id: session._id, status: "uploading" },
    {
      $addToSet: { receivedChunks: index },
      $set: {
        lastActivityAt: new Date(),
        expiresAt: expiryDate(),
      },
    }
  );

  return { received: true, index };
}

async function assembleChunks(session: {
  tempRelPath: string;
  totalChunks: number;
  size: number;
  chunkSize: number;
}): Promise<{ assembledPath: string; checksum: string }> {
  const directory = getStoragePath(session.tempRelPath);
  const assembledPath = path.join(directory, `.assembled-${randomUUID()}`);
  const handle = await fsp.open(assembledPath, "wx");
  const hash = createHash("sha256");
  let total = 0;
  try {
    for (let index = 0; index < session.totalChunks; index++) {
      const partPath = path.join(directory, partFileName(index));
      const expected = expectedPartSize(session.size, session.chunkSize, index);
      const stat = await fsp.stat(partPath).catch(() => null);
      if (!stat || stat.size !== expected) {
        throw new ApiError(409, `Chunk ${index} is missing or invalid`, "MISSING_CHUNK");
      }
      const stream = fs.createReadStream(partPath, { highWaterMark: 4 * 1024 * 1024 });
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > session.size) {
          throw new ApiError(400, "Uploaded data exceeds declared file size", "SIZE_MISMATCH");
        }
        hash.update(buffer);
        await handle.write(buffer);
      }
    }
    if (total !== session.size) {
      throw new ApiError(400, "Uploaded data does not match declared size", "SIZE_MISMATCH");
    }
  } catch (error) {
    await handle.close().catch(() => undefined);
    await removeFileIfExists(assembledPath);
    throw error;
  }
  await handle.close();
  return { assembledPath, checksum: hash.digest("hex") };
}

export async function completeUpload(
  userId: string,
  uploadId: string
): Promise<UploadCompleteResponse> {
  await connectDB();
  let session = await UploadSession.findOne({ uploadId, owner: userId }).lean();
  if (!session) throw new ApiError(404, "Upload session not found", "NOT_FOUND");

  if (session.status === "completed") {
    if (session.completedFileId) {
      const file = await File.findOne({
        _id: session.completedFileId,
        owner: userId,
        deletedAt: null,
      }).lean();
      if (file) {
        return {
          file: fileToDTO(file, "owner", false),
          duplicateOf: null,
        };
      }
    }
    throw new ApiError(410, "This upload has already been finalized", "UPLOAD_FINALIZED");
  }
  if (session.status === "assembling") {
    throw new ApiError(409, "Upload is already being finalized. Retry shortly.", "UPLOAD_ASSEMBLING");
  }
  if (session.status !== "uploading") {
    throw new ApiError(409, "This upload can no longer be finalized", "UPLOAD_ABORTED");
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw new ApiError(410, "Upload session has expired", "UPLOAD_EXPIRED");
  }
  if (session.receivedChunks.length !== session.totalChunks) {
    throw new ApiError(409, "Not all chunks have been uploaded", "UPLOAD_INCOMPLETE");
  }

  const validChunks = await verifyReceivedChunks(session);
  if (validChunks.length !== session.totalChunks) {
    await UploadSession.updateOne(
      { _id: session._id },
      { $set: { receivedChunks: validChunks } }
    );
    throw new ApiError(409, "Some chunks are missing. Re-upload them and retry.", "UPLOAD_INCOMPLETE");
  }

  if (!(await parentIsEditable(userId, session.parentId))) {
    await abortUpload(userId, uploadId);
    throw new ApiError(403, "The destination folder is no longer available.", "FORBIDDEN");
  }

  const claimed = await UploadSession.findOneAndUpdate(
    { _id: session._id, status: "uploading" },
    { $set: { status: "assembling", lastActivityAt: new Date() } },
    { new: true }
  ).lean();
  if (!claimed) {
    throw new ApiError(409, "Upload is already being finalized. Retry shortly.", "UPLOAD_ASSEMBLING");
  }
  session = claimed;

  let assembledPath: string | null = null;
  let finalPathCreated: string | null = null;
  let fileCreatedId: string | null = null;

  try {
    const user = await import("@/models/User").then(({ User }) => User.findById(userId).lean());
    if (!user) throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
    await assertWithinQuota(userId, user.storageQuotaBytes, 0);
    await assertSufficientDiskSpace(0);

    const assembled = await assembleChunks(session);
    assembledPath = assembled.assembledPath;
    const validated = await validateStoredUpload(
      assembled.assembledPath,
      session.filename,
      session.mimeType,
      session.size
    );

    const availableName = await ensureAvailableName({
      desiredName: session.filename,
      parentId: session.parentId,
    });
    const location = newStorageLocation(userId);
    const destination = getStoragePath(location.storageRelPath);
    await ensureDirectory(path.posix.dirname(location.storageRelPath));
    await moveFile(assembled.assembledPath, destination);
    assembledPath = null;
    finalPathCreated = location.storageRelPath;

    const stat = await fsp.stat(destination);
    if (stat.size !== session.size) {
      throw new ApiError(400, "Stored file size does not match upload metadata", "SIZE_MISMATCH");
    }

    const thumbnails = fileNeedsThumbnail({ mimeType: validated.mimeType });
    const file = await File.create({
      owner: userId,
      name: availableName,
      nameKey: nameKey(availableName),
      parentId: session.parentId,
      storageName: location.storageName,
      storageRelPath: location.storageRelPath,
      mimeType: validated.mimeType,
      extension: validated.extension,
      size: stat.size,
      checksumSha256: assembled.checksum,
      thumbnailStatus: thumbnails ? "pending" : "not_applicable",
      previewStatus: "not_applicable",
      mediaMetadata: validated.format ? { format: validated.format } : undefined,
      uploadedVia: "web",
    });
    fileCreatedId = file._id.toString();

    const duplicate = await File.findOne({
      owner: userId,
      checksumSha256: assembled.checksum,
      size: stat.size,
      _id: { $ne: file._id },
      deletedAt: null,
    })
      .sort({ createdAt: 1 })
      .select("_id name createdAt")
      .lean();

    await UploadSession.updateOne(
      { _id: session._id },
      {
        $set: {
          status: "completed",
          completedFileId: file._id,
          receivedChunks: [],
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          lastActivityAt: new Date(),
        },
      }
    );
    await fsp.rm(getStoragePath(session.tempRelPath), { recursive: true, force: true }).catch(() => undefined);

    if (thumbnails) await enqueueThumbnailJob(file);

    return {
      file: fileToDTO(file.toObject(), "owner", false),
      duplicateOf: duplicate
        ? {
            id: duplicate._id.toString(),
            name: duplicate.name,
            createdAt: duplicate.createdAt.toISOString(),
          }
        : null,
    };
  } catch (error) {
    if (finalPathCreated) {
      await removeFileIfExists(getStoragePath(finalPathCreated)).catch(() => undefined);
    }
    if (fileCreatedId) {
      await File.deleteOne({ _id: fileCreatedId }).catch(() => undefined);
    }
    if (assembledPath) {
      await removeFileIfExists(assembledPath).catch(() => undefined);
    }

    const terminal =
      error instanceof ApiError &&
      ["FILE_TYPE_NOT_ALLOWED", "FILE_TYPE_MISMATCH", "UNRECOGNIZED_FILE_TYPE"].includes(
        error.code
      );
    await UploadSession.updateOne(
      { _id: session._id, status: "assembling" },
      {
        $set: {
          status: terminal ? "aborted" : "uploading",
          ...(terminal ? { receivedChunks: [] } : {}),
        },
      }
    ).catch(() => undefined);
    if (terminal) {
      await fsp.rm(getStoragePath(session.tempRelPath), { recursive: true, force: true }).catch(
        () => undefined
      );
    }
    logger.warn("Upload finalization failed", {
      error,
      uploadId,
      terminal,
    });
    throw error;
  }
}

export async function abortUpload(userId: string, uploadId: string): Promise<void> {
  const session = await UploadSession.findOne({ uploadId, owner: userId }).lean();
  if (!session) throw new ApiError(404, "Upload session not found", "NOT_FOUND");
  if (session.status === "assembling") {
    throw new ApiError(409, "Upload is being finalized and cannot be aborted now", "UPLOAD_ASSEMBLING");
  }
  await UploadSession.updateOne(
    { _id: session._id, status: { $ne: "completed" } },
    { $set: { status: "aborted", receivedChunks: [] } }
  );
  if (session.status !== "completed") {
    await fsp.rm(getStoragePath(session.tempRelPath), { recursive: true, force: true }).catch(
      (error) => logger.warn("Failed to remove aborted upload temp files", { error, uploadId })
    );
    await UploadSession.deleteOne({ _id: session._id });
  }
}

export async function cleanupExpiredUploads(): Promise<number> {
  const expired = await UploadSession.find({
    expiresAt: { $lt: new Date() },
  })
    .limit(200)
    .lean();
  let cleaned = 0;
  for (const session of expired) {
    try {
      if (session.status !== "completed") {
        await fsp.rm(getStoragePath(session.tempRelPath), { recursive: true, force: true });
      }
      await UploadSession.deleteOne({ _id: session._id });
      cleaned++;
    } catch (error) {
      logger.warn("Failed to clean expired upload", { error, uploadId: session.uploadId });
    }
  }
  return cleaned;
}
