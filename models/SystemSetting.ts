import { model, models, Schema, type Model } from "mongoose";

export interface ISystemSetting {
  key: "global";
  publicSharingEnabled: boolean;
  trashRetentionDays: number;
  allowCameraUpload: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SystemSettingSchema = new Schema<ISystemSetting>(
  {
    key: { type: String, default: "global", unique: true, enum: ["global"] },
    publicSharingEnabled: { type: Boolean, default: false, required: true },
    trashRetentionDays: { type: Number, default: 30, min: 1, max: 3650, required: true },
    allowCameraUpload: { type: Boolean, default: true, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const SystemSetting: Model<ISystemSetting> =
  (models.SystemSetting as Model<ISystemSetting> | undefined) ??
  model<ISystemSetting>("SystemSetting", SystemSettingSchema);
