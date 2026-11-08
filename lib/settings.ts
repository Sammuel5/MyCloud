import { connectDB } from "@/lib/db";
import { getTrashRetentionFallbackDays } from "@/lib/config";
import { SystemSetting, type ISystemSetting } from "@/models/SystemSetting";

export async function getSystemSettings(): Promise<ISystemSetting> {
  await connectDB();
  const existing = await SystemSetting.findOne({ key: "global" }).lean();
  if (existing) return existing;

  const created = await SystemSetting.findOneAndUpdate(
    { key: "global" },
    {
      $setOnInsert: {
        key: "global",
        publicSharingEnabled: false,
        trashRetentionDays: getTrashRetentionFallbackDays(),
        allowCameraUpload: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  if (!created) throw new Error("Unable to initialize system settings");
  return created;
}

export async function updateSystemSettings(
  update: Partial<
    Pick<ISystemSetting, "publicSharingEnabled" | "trashRetentionDays" | "allowCameraUpload">
  >
): Promise<ISystemSetting> {
  await getSystemSettings();
  const updated = await SystemSetting.findOneAndUpdate(
    { key: "global" },
    { $set: update },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) throw new Error("Unable to update system settings");
  return updated;
}
