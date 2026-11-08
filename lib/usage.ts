import { Types } from "mongoose";
import { File } from "@/models/File";
import { UploadSession } from "@/models/UploadSession";
import { getDiskSpace } from "@/lib/storage";
import { ApiError } from "@/lib/request";
import type { QuotaDTO } from "@/lib/types";

export async function getUsedBytes(userId: string | Types.ObjectId): Promise<number> {
  const result = await File.aggregate([
    { $match: { owner: new Types.ObjectId(userId.toString()) } },
    { $group: { _id: null, total: { $sum: "$size" } } },
  ]);
  return Number(result[0]?.total || 0);
}

export async function getReservedUploadBytes(userId: string | Types.ObjectId): Promise<number> {
  const result = await UploadSession.aggregate([
    {
      $match: {
        owner: new Types.ObjectId(userId.toString()),
        status: { $in: ["uploading", "assembling"] },
        expiresAt: { $gt: new Date() },
      },
    },
    { $group: { _id: null, total: { $sum: "$size" } } },
  ]);
  return Number(result[0]?.total || 0);
}

export async function getQuotaState(
  userId: string,
  quotaBytes: number
): Promise<QuotaDTO> {
  const [usedBytes, disk] = await Promise.all([
    getUsedBytes(userId),
    getDiskSpace().catch(() => ({ totalBytes: 0, freeBytes: 0, usedBytes: 0 })),
  ]);
  const percent = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;
  return {
    usedBytes,
    quotaBytes,
    percent: Math.round(percent * 10) / 10,
    warning: quotaBytes === 0 ? "none" : percent >= 100 ? "full" : percent >= 90 ? "near" : "none",
    totalDiskBytes: disk.totalBytes,
    freeDiskBytes: disk.freeBytes,
  };
}

export async function assertWithinQuota(
  userId: string,
  quotaBytes: number,
  incomingBytes: number
): Promise<void> {
  if (quotaBytes <= 0) return;
  const [used, reserved] = await Promise.all([
    getUsedBytes(userId),
    getReservedUploadBytes(userId),
  ]);
  if (used + reserved + incomingBytes > quotaBytes) {
    throw new ApiError(
      413,
      "This upload would exceed your storage quota.",
      "QUOTA_EXCEEDED",
      { usedBytes: used, quotaBytes }
    );
  }
}
