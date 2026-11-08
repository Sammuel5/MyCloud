import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import type { IFile } from "@/models/File";
import { getStoragePath } from "@/lib/storage";
import { encodeContentDisposition, getExtension } from "@/lib/file-names";
import {
  isInlineSafeMime,
  safeMimeForServing,
} from "@/lib/mime";
import { parseByteRange, contentRangeHeader } from "@/lib/range";
import { ApiError, json } from "@/lib/request";
import { logger } from "@/lib/logger";

export interface ContentOptions {
  allowDownload: boolean;
  previewOnly?: boolean;
  forceAttachment?: boolean;
}

export async function fileContentResponse(
  request: Request,
  file: IFile,
  options: ContentOptions
): Promise<Response> {
  if (!file.storageRelPath) {
    throw new ApiError(404, "File content is unavailable", "CONTENT_MISSING");
  }
  const url = new URL(request.url);
  const wantsDownload =
    options.forceAttachment || url.searchParams.get("download") === "1";
  if (wantsDownload && !options.allowDownload) {
    throw new ApiError(403, "Downloads are disabled for this share", "DOWNLOAD_DISABLED");
  }

  const mimeType = safeMimeForServing(file.mimeType);
  const inline = !wantsDownload && isInlineSafeMime(mimeType);
  if (!inline && !wantsDownload && options.previewOnly) {
    throw new ApiError(
      403,
      "This file type cannot be previewed and downloads are disabled",
      "DOWNLOAD_DISABLED"
    );
  }
  const disposition = inline ? "inline" : "attachment";
  const absolutePath = getStoragePath(file.storageRelPath);
  let stat;
  try {
    stat = await fsp.stat(absolutePath);
  } catch {
    logger.error("Stored file is missing", { fileId: file._id.toString() });
    throw new ApiError(404, "File content is unavailable", "CONTENT_MISSING");
  }

  const headers = new Headers({
    "Content-Type": mimeType,
    "Content-Disposition": encodeContentDisposition(file.name, disposition),
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "private, no-store",
    ETag: `"${file.checksumSha256}"`,
    "Last-Modified": stat.mtime.toUTCString(),
  });

  const rangeHeader = request.headers.get("range");
  const range = parseByteRange(rangeHeader, stat.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${stat.size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }

  if (request.method === "HEAD") {
    headers.set("Content-Length", String(stat.size));
    return new Response(null, { status: 200, headers });
  }

  if (range) {
    headers.set("Content-Range", contentRangeHeader(range, stat.size));
    headers.set("Content-Length", String(range.end - range.start + 1));
    const nodeStream = fs.createReadStream(absolutePath, {
      start: range.start,
      end: range.end,
    });
    return new Response(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(stat.size));
  if (stat.size === 0) {
    return new Response(new Uint8Array(), { status: 200, headers });
  }
  const nodeStream = fs.createReadStream(absolutePath);
  return new Response(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
    status: 200,
    headers,
  });
}

export async function thumbnailResponse(file: IFile): Promise<Response> {
  if (file.thumbnailStatus !== "ready" || !file.thumbnailRelPath) {
    throw new ApiError(404, "Thumbnail is not available", "THUMBNAIL_MISSING");
  }
  const absolutePath = getStoragePath(file.thumbnailRelPath);
  let stat;
  try {
    stat = await fsp.stat(absolutePath);
  } catch {
    throw new ApiError(404, "Thumbnail is not available", "THUMBNAIL_MISSING");
  }
  const nodeStream = fs.createReadStream(absolutePath);
  return new Response(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

const MAX_TEXT_PREVIEW_BYTES = 200 * 1024;

export async function textPreviewResponse(file: IFile): Promise<Response> {
  const extension = getExtension(file.name);
  const allowed =
    ["txt", "md", "csv", "json"].includes(extension) ||
    file.mimeType === "text/plain" ||
    file.mimeType === "text/csv" ||
    file.mimeType === "application/json";
  if (!allowed) {
    throw new ApiError(415, "This file cannot be previewed as text", "PREVIEW_UNSUPPORTED");
  }
  const absolutePath = getStoragePath(file.storageRelPath);
  const handle = await fsp.open(absolutePath, "r").catch(() => {
    throw new ApiError(404, "File content is unavailable", "CONTENT_MISSING");
  });
  try {
    const stat = await handle.stat();
    const length = Math.min(stat.size, MAX_TEXT_PREVIEW_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const sample = buffer.subarray(0, bytesRead);
    if (sample.includes(0)) {
      throw new ApiError(415, "Binary content cannot be shown as text", "PREVIEW_UNSUPPORTED");
    }
    const text = sample.toString("utf8");
    if (text.includes("\uFFFD")) {
      throw new ApiError(415, "This text encoding is not supported", "PREVIEW_UNSUPPORTED");
    }
    return json({
      text,
      truncated: stat.size > MAX_TEXT_PREVIEW_BYTES,
      size: stat.size,
      mimeType: file.mimeType,
    });
  } finally {
    await handle.close();
  }
}
