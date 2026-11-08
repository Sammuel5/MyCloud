import { model, models, Schema, type Model, type Types } from "mongoose";
import type { ResourceType } from "@/models/Share";

export interface IShareLink {
  _id: Types.ObjectId;
  tokenHash: string;
  resourceType: ResourceType;
  resourceId: Types.ObjectId;
  owner: Types.ObjectId;
  createdBy: Types.ObjectId;
  passwordHash?: string | null;
  expiresAt?: Date | null;
  allowDownload: boolean;
  accessCount: number;
  lastAccessedAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ShareLinkSchema = new Schema<IShareLink>(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    resourceType: { type: String, enum: ["file", "folder"], required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true, refPath: "resourceType" },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    passwordHash: { type: String, default: null, select: false },
    expiresAt: { type: Date, default: null, index: true },
    allowDownload: { type: Boolean, default: true, required: true },
    accessCount: { type: Number, default: 0, min: 0 },
    lastAccessedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ShareLinkSchema.index({ owner: 1, resourceType: 1, resourceId: 1, createdAt: -1 });

export const ShareLink: Model<IShareLink> =
  (models.ShareLink as Model<IShareLink> | undefined) ??
  model<IShareLink>("ShareLink", ShareLinkSchema);
