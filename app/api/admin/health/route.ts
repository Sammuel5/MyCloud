import os from "node:os";
import { requireAdminUser } from "@/lib/auth-user";
import { connectDB, databaseHealth } from "@/lib/db";
import { getMongoUri } from "@/lib/config";
import { getDiskSpace, storageHealth } from "@/lib/storage";
import { getSystemSettings } from "@/lib/settings";
import { checkMediaBinaries } from "@/lib/media-health";
import { File } from "@/models/File";
import { Folder } from "@/models/Folder";
import { User } from "@/models/User";
import { Job } from "@/models/Job";
import { UploadSession } from "@/models/UploadSession";
import { UserSession } from "@/models/UserSession";
import { ShareLink } from "@/models/ShareLink";
import { handleApiError, json } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mongoIsLocal(uri: string): boolean {
  try {
    const normalized = uri.replace(/^mongodb(\+srv)?:\/\//, "http://");
    const host = new URL(normalized).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    await requireAdminUser();
    await connectDB().catch(() => undefined);
    const [database, storage, disk, binaries, settings] = await Promise.all([
      databaseHealth().catch(() => ({ ok: false })),
      storageHealth().catch(() => ({ ok: false, writable: false })),
      getDiskSpace().catch(() => ({ totalBytes: 0, usedBytes: 0, freeBytes: 0 })),
      checkMediaBinaries(),
      getSystemSettings(),
    ]);
    const [users, files, folders, activeSessions, activeUploads, links, jobs] =
      await Promise.all([
        User.countDocuments({ active: true }),
        File.countDocuments({ deletedAt: null }),
        Folder.countDocuments({ deletedAt: null }),
        UserSession.countDocuments({ revokedAt: null, expiresAt: { $gt: new Date() } }),
        UploadSession.countDocuments({ status: { $in: ["uploading", "assembling"] } }),
        ShareLink.countDocuments({ revokedAt: null }),
        Job.aggregate<{ _id: string; count: number }>([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
      ]);

    const jobCounts: Record<string, number> = {};
    for (const job of jobs) jobCounts[job._id] = job.count;

    return json({
      status:
        database.ok && storage.ok && storage.writable ? "healthy" : "degraded",
      app: {
        name: process.env.MYCLOUD_APP_NAME || "MyCloud",
        version: process.env.npm_package_version || "1.0.0",
        node: process.version,
        platform: `${os.platform()} ${os.release()}`,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsedBytes: process.memoryUsage().rss,
      },
      database: {
        ok: database.ok,
        latencyMs: "latencyMs" in database ? database.latencyMs ?? null : null,
        local: mongoIsLocal(getMongoUri()),
        users,
        files,
        folders,
        activeSessions,
      },
      storage: {
        ok: storage.ok,
        writable: storage.writable,
        disk,
        activeUploads,
      },
      media: {
        ffmpeg: {
          ok: binaries.ffmpeg.ok,
          version: binaries.ffmpeg.version,
        },
        ffprobe: {
          ok: binaries.ffprobe.ok,
          version: binaries.ffprobe.version,
        },
      },
      jobs: {
        queued: jobCounts.queued || 0,
        running: jobCounts.running || 0,
        completed: jobCounts.completed || 0,
        failed: jobCounts.failed || 0,
      },
      sharing: {
        publicLinks: links,
        publicSharingEnabled: settings.publicSharingEnabled,
      },
      warnings: [
        ...(database.ok ? [] : ["MongoDB is not reachable."]),
        ...(storage.ok && storage.writable
          ? []
          : ["The storage volume is not writable."]),
        ...(binaries.ffmpeg.ok ? [] : ["FFmpeg is unavailable; video thumbnails will fail."]),
        ...(binaries.ffprobe.ok ? [] : ["FFprobe is unavailable; video metadata will fail."]),
        ...(mongoIsLocal(getMongoUri())
          ? []
          : ["MongoDB is not configured on localhost. Verify it is not publicly exposed."]),
      ],
    });
  } catch (error) {
    return handleApiError(error);
  }
}
