import { Job } from "@/models/Job";
import { File } from "@/models/File";
import { Folder } from "@/models/Folder";
import { processThumbnail } from "@/lib/thumbnails";
import { requeueStaleJobs } from "@/lib/jobs";
import { cleanupExpiredUploads } from "@/lib/uploads";
import { permanentlyDeleteTrashItem } from "@/lib/trash";
import { getSystemSettings } from "@/lib/settings";
import { logger } from "@/lib/logger";
import { connectDB } from "@/lib/db";

interface WorkerState {
  started: boolean;
  processing: number;
  timer?: NodeJS.Timeout;
  maintenanceTimer?: NodeJS.Timeout;
}

declare global {
  // eslint-disable-next-line no-var
  var __mycloudWorker: WorkerState | undefined;
}

const state: WorkerState =
  global.__mycloudWorker ?? (global.__mycloudWorker = { started: false, processing: 0 });

const MAX_CONCURRENT_JOBS = 2;

async function processNextJob(): Promise<boolean> {
  if (state.processing >= MAX_CONCURRENT_JOBS) return false;
  const job = await Job.findOneAndUpdate(
    {
      status: "queued",
      availableAt: { $lte: new Date() },
    },
    {
      $set: { status: "running", lockedAt: new Date() },
      $inc: { attempts: 1 },
    },
    { sort: { availableAt: 1 }, new: true }
  ).lean();
  if (!job) return false;

  state.processing++;
  try {
    if (job.type === "thumbnail") {
      const fileId = String(job.payload?.fileId || "");
      if (!fileId) throw new Error("Thumbnail job has no file ID");
      await processThumbnail(fileId);
    }
    await Job.updateOne(
      { _id: job._id },
      { $set: { status: "completed", completedAt: new Date(), lockedAt: null } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    if (job.attempts >= job.maxAttempts) {
      await Job.updateOne(
        { _id: job._id },
        { $set: { status: "failed", lastError: message.slice(0, 2000), lockedAt: null } }
      );
      if (job.type === "thumbnail" && job.payload?.fileId) {
        await File.updateOne(
          { _id: job.payload.fileId },
          { $set: { thumbnailStatus: "failed", thumbnailError: message.slice(0, 500) } }
        ).catch(() => undefined);
      }
    } else {
      const delay = Math.min(30 * 60 * 1000, 30_000 * 2 ** job.attempts);
      await Job.updateOne(
        { _id: job._id },
        {
          $set: {
            status: "queued",
            lockedAt: null,
            lastError: message.slice(0, 2000),
            availableAt: new Date(Date.now() + delay),
          },
        }
      );
    }
    logger.warn("Background job failed", { error, jobId: job._id.toString(), attempts: job.attempts });
  } finally {
    state.processing--;
  }
  return true;
}

async function pump(): Promise<void> {
  try {
    await connectDB();
    let worked = true;
    while (worked && state.processing < MAX_CONCURRENT_JOBS) {
      worked = await processNextJob();
    }
  } catch (error) {
    logger.warn("Background worker poll failed", { error });
  }
}

async function runMaintenance(): Promise<void> {
  try {
    await connectDB();
    await requeueStaleJobs();
    await cleanupExpiredUploads();

    const settings = await getSystemSettings();
    const cutoff = new Date(
      Date.now() - settings.trashRetentionDays * 24 * 60 * 60 * 1000
    );
    const [expiredFolders, expiredFiles] = await Promise.all([
      Folder.find({
        isTrashRoot: true,
        deletedAt: { $ne: null, $lte: cutoff },
      })
        .select("_id owner")
        .limit(50)
        .lean(),
      File.find({
        isTrashRoot: true,
        deletedAt: { $ne: null, $lte: cutoff },
      })
        .select("_id owner")
        .limit(50)
        .lean(),
    ]);
    for (const folder of expiredFolders) {
      await permanentlyDeleteTrashItem(folder.owner.toString(), "folder", folder._id.toString()).catch(
        (error) => logger.warn("Expired trash purge failed", { error, itemId: folder._id })
      );
    }
    for (const file of expiredFiles) {
      await permanentlyDeleteTrashItem(file.owner.toString(), "file", file._id.toString()).catch(
        (error) => logger.warn("Expired trash purge failed", { error, itemId: file._id })
      );
    }
  } catch (error) {
    logger.warn("Maintenance pass failed", { error });
  }
}

export function startBackgroundWorkers(): void {
  if (state.started) return;
  if (process.env.MYCLOUD_DISABLE_WORKER === "true") {
    logger.info("Background worker disabled by MYCLOUD_DISABLE_WORKER");
    return;
  }
  state.started = true;
  state.timer = setInterval(() => {
    void pump();
  }, 4_000);
  state.timer.unref?.();
  state.maintenanceTimer = setInterval(() => {
    void runMaintenance();
  }, 15 * 60 * 1000);
  state.maintenanceTimer.unref?.();

  setTimeout(() => {
    void pump();
    void runMaintenance();
  }, 5_000).unref?.();
  logger.info("Background worker started");
}
