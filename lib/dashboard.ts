import { Types } from "mongoose";
import { File } from "@/models/File";
import { Folder } from "@/models/Folder";
import { Share } from "@/models/Share";
import { getDiskSpace } from "@/lib/storage";
import { getQuotaState, getUsedBytes } from "@/lib/usage";
import { categoryForMime } from "@/lib/mime";
import { fileToDTO } from "@/lib/item-dto";
import type { DashboardData, FileCategory } from "@/lib/types";
import type { CurrentUser } from "@/lib/auth-user";

const CATEGORY_ORDER: FileCategory[] = [
  "image",
  "video",
  "document",
  "audio",
  "archive",
  "other",
];

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getDashboardData(user: CurrentUser): Promise<DashboardData> {
  const userId = new Types.ObjectId(user.id);
  const active = { owner: userId, deletedAt: null };
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 13);

  const [
    quota,
    disk,
    appUsedBytes,
    activeFiles,
    folders,
    photos,
    videos,
    trashRoots,
    sharedWithMe,
    sharedByMe,
    mimeGroups,
    trashAggregate,
    recent,
    largest,
    activityRaw,
  ] = await Promise.all([
    getQuotaState(user.id, user.storageQuotaBytes),
    getDiskSpace().catch(() => ({ totalBytes: 0, freeBytes: 0, usedBytes: 0 })),
    getUsedBytes(user.id),
    File.countDocuments(active),
    Folder.countDocuments(active),
    File.countDocuments({ ...active, mimeType: /^image\//i }),
    File.countDocuments({ ...active, mimeType: /^video\//i }),
    Promise.all([
      File.countDocuments({
        owner: userId,
        deletedAt: { $ne: null },
        isTrashRoot: true,
      }),
      Folder.countDocuments({
        owner: userId,
        deletedAt: { $ne: null },
        isTrashRoot: true,
      }),
    ]).then(([files, folderCount]) => files + folderCount),
    Share.countDocuments({ sharedWith: userId }),
    Share.countDocuments({ owner: userId }),
    File.aggregate([
      { $match: active },
      { $group: { _id: "$mimeType", bytes: { $sum: "$size" }, count: { $sum: 1 } } },
    ]),
    File.aggregate([
      { $match: { owner: userId, deletedAt: { $ne: null } } },
      { $group: { _id: null, total: { $sum: "$size" } } },
    ]),
    File.find(active).sort({ createdAt: -1 }).limit(6).lean(),
    File.find(active).sort({ size: -1 }).limit(6).lean(),
    File.aggregate([
      { $match: { ...active, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
          uploads: { $sum: 1 },
          bytes: { $sum: "$size" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const categoryTotals = new Map<FileCategory, { bytes: number; count: number }>();
  for (const category of CATEGORY_ORDER) {
    categoryTotals.set(category, { bytes: 0, count: 0 });
  }
  for (const group of mimeGroups as Array<{ _id: string; bytes: number; count: number }>) {
    const category = categoryForMime(group._id || "application/octet-stream");
    const current = categoryTotals.get(category) || { bytes: 0, count: 0 };
    current.bytes += Number(group.bytes || 0);
    current.count += Number(group.count || 0);
    categoryTotals.set(category, current);
  }

  const activityMap = new Map(
    (activityRaw as Array<{ _id: string; uploads: number; bytes: number }>).map((entry) => [
      entry._id,
      { uploads: Number(entry.uploads), bytes: Number(entry.bytes) },
    ])
  );
  const activity = [];
  for (let index = 0; index < 14; index++) {
    const date = new Date(since);
    date.setUTCDate(since.getUTCDate() + index);
    const key = dayKey(date);
    const entry = activityMap.get(key) || { uploads: 0, bytes: 0 };
    activity.push({ date: key, ...entry });
  }

  return {
    quota,
    appUsedBytes,
    trashBytes: Number(trashAggregate[0]?.total || 0),
    counts: {
      files: activeFiles,
      folders,
      photos,
      videos,
      trashItems: trashRoots,
      sharedWithMe,
      sharedByMe,
    },
    disk,
    categories: CATEGORY_ORDER.map((category) => ({
      category,
      ...(categoryTotals.get(category) || { bytes: 0, count: 0 }),
    })),
    recentUploads: recent.map((file) => fileToDTO(file, "owner", false)),
    largestFiles: largest.map((file) => fileToDTO(file, "owner", false)),
    activity,
  };
}
