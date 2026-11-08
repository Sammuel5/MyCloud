import type { IFile } from "@/models/File";
import { Job } from "@/models/Job";
import { categoryForMime } from "@/lib/mime";
import { logger } from "@/lib/logger";

export function fileNeedsThumbnail(file: Pick<IFile, "mimeType">): boolean {
  return ["image", "video"].includes(categoryForMime(file.mimeType));
}

export async function enqueueThumbnailJob(file: Pick<IFile, "_id" | "mimeType">): Promise<void> {
  if (!fileNeedsThumbnail(file)) return;
  const fileId = file._id.toString();
  try {
    const existing = await Job.findOne({
      type: "thumbnail",
      "payload.fileId": fileId,
      status: { $in: ["queued", "running"] },
    }).select("_id");
    if (existing) return;
    await Job.create({
      type: "thumbnail",
      payload: { fileId },
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      availableAt: new Date(),
    });
  } catch (error) {
    logger.warn("Could not enqueue thumbnail job", { error, fileId });
  }
}

export async function requeueStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const result = await Job.updateMany(
    { status: "running", lockedAt: { $lt: cutoff } },
    {
      $set: {
        status: "queued",
        lockedAt: null,
        availableAt: new Date(),
      },
      $inc: { attempts: 1 },
    }
  );
  return result.modifiedCount;
}
