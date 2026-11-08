import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getStoragePath, ensureDirectory } from "@/lib/storage";
import { getFfmpegPath, getFfprobePath } from "@/lib/config";
import { newThumbnailLocation } from "@/lib/file-storage";
import { categoryForMime } from "@/lib/mime";
import { File, type IFile } from "@/models/File";
import { logger } from "@/lib/logger";

interface ProbeResult {
  width?: number;
  height?: number;
  durationSeconds?: number;
  format?: string;
}

async function resolveExecutable(
  configured: string | undefined,
  packageName: "ffmpeg-static" | "ffprobe-static"
): Promise<string> {
  if (configured) {
    try {
      await fsp.access(configured, fs.constants.X_OK);
      return configured;
    } catch {
      logger.warn("Configured media binary is not executable", { packageName });
    }
  }
  try {
    if (packageName === "ffmpeg-static") {
      const mediaModule = await import("ffmpeg-static");
      const candidate = (mediaModule.default || mediaModule) as unknown as string;
      if (candidate && fs.existsSync(candidate)) return candidate;
    } else {
      const mediaModule = await import("ffprobe-static");
      const candidate = mediaModule.default?.path || mediaModule.path;
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // Fall through to PATH.
  }
  return packageName === "ffmpeg-static" ? "ffmpeg" : "ffprobe";
}

function runProcess(
  executable: string,
  args: string[],
  timeoutMs = 60_000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("Media process timed out"));
      }
    }, timeoutMs);
    timeout.unref?.();

    child.stdout.on("data", (data: Buffer) => {
      if (stdout.length < 2 * 1024 * 1024) stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      if (stderr.length < 16_000) stderr += data.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Media process exited with code ${code}`));
    });
  });
}

async function probeVideo(absolutePath: string): Promise<ProbeResult> {
  const executable = await resolveExecutable(getFfprobePath(), "ffprobe-static");
  const result = await runProcess(executable, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    absolutePath,
  ]);
  try {
    const parsed = JSON.parse(result.stdout) as {
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        duration?: string;
        format_name?: string;
      }>;
      format?: { duration?: string; format_name?: string };
    };
    const videoStream = parsed.streams?.find((stream) => stream.codec_type === "video");
    const duration = Number(parsed.format?.duration || videoStream?.duration);
    return {
      width: videoStream?.width,
      height: videoStream?.height,
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined,
      format: parsed.format?.format_name?.split(",")[0],
    };
  } catch {
    return {};
  }
}

async function generateImageThumbnail(
  file: IFile,
  source: string,
  destination: string,
  thumbnailRelativePath: string
): Promise<{ width?: number; height?: number; format?: string; hasExif?: boolean }> {
  await ensureDirectory(path.posix.dirname(thumbnailRelativePath));
  const pipeline = sharp(source, {
    failOn: "error",
    limitInputPixels: 100_000_000,
  }).rotate();
  const metadata = await pipeline.metadata();
  await pipeline
    .resize({
      width: 720,
      height: 720,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toFile(destination);
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    hasExif: Boolean(metadata.exif),
  };
}

async function generateVideoThumbnail(
  file: IFile,
  source: string,
  destination: string
): Promise<ProbeResult> {
  const metadata = await probeVideo(source);
  const tempDirectory = getStoragePath("temp/jobs");
  await fsp.mkdir(tempDirectory, { recursive: true });
  const tempFrame = path.join(tempDirectory, `${randomUUID()}.jpg`);
  const seek = metadata.durationSeconds
    ? Math.min(Math.max(metadata.durationSeconds * 0.1, 0.1), 5)
    : 1;
  const ffmpeg = await resolveExecutable(getFfmpegPath(), "ffmpeg-static");
  try {
    await runProcess(ffmpeg, [
      "-nostdin",
      "-y",
      "-ss",
      seek.toFixed(2),
      "-i",
      source,
      "-frames:v",
      "1",
      "-vf",
      "scale='min(720,iw)':-2",
      tempFrame,
    ]);
    await sharp(tempFrame, { failOn: "error", limitInputPixels: 100_000_000 })
      .webp({ quality: 82, effort: 4 })
      .toFile(destination);
  } finally {
    await fsp.unlink(tempFrame).catch(() => undefined);
  }
  return metadata;
}

export async function processThumbnail(fileId: string): Promise<void> {
  const file = await File.findOne({ _id: fileId, deletedAt: null }).lean();
  if (!file) return;
  const category = categoryForMime(file.mimeType);
  if (category !== "image" && category !== "video") {
    await File.updateOne(
      { _id: file._id },
      { $set: { thumbnailStatus: "not_applicable", thumbnailRelPath: null } }
    );
    return;
  }

  const source = getStoragePath(file.storageRelPath);
  const location = newThumbnailLocation(file.owner.toString());
  const destinationRelative = location.relativePath;
  const destination = getStoragePath(destinationRelative);

  try {
    let metadata: ProbeResult & { hasExif?: boolean };
    if (category === "image") {
      metadata = {
        ...(await generateImageThumbnail(file, source, destination, destinationRelative)),
      };
    } else {
      await ensureDirectory(path.posix.dirname(destinationRelative));
      metadata = await generateVideoThumbnail(file, source, destination);
    }

    await File.updateOne(
      { _id: file._id, deletedAt: null },
      {
        $set: {
          thumbnailStatus: "ready",
          thumbnailRelPath: destinationRelative,
          thumbnailError: null,
          "mediaMetadata.width": metadata.width,
          "mediaMetadata.height": metadata.height,
          "mediaMetadata.durationSeconds": metadata.durationSeconds,
          "mediaMetadata.hasExif": metadata.hasExif || false,
          "mediaMetadata.format": metadata.format,
        },
      }
    );
    logger.info("Thumbnail generated", { fileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Thumbnail generation failed";
    await fsp.unlink(destination).catch(() => undefined);
    await File.updateOne(
      { _id: file._id },
      {
        $set: {
          thumbnailStatus: "failed",
          thumbnailRelPath: null,
          thumbnailError: message.slice(0, 500),
        },
      }
    );
    logger.warn("Thumbnail generation failed", { error, fileId });
    throw error;
  }
}
