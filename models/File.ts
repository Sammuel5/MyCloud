import { model, models, Schema, type Model, type Types } from "mongoose";

export interface FileMediaMetadata {
  width?: number;
  height?: number;
  durationSeconds?: number;
  capturedAt?: Date;
  hasExif?: boolean;
  format?: string;
}

export interface IFile {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  name: string;
  nameKey: string;
  parentId: Types.ObjectId | null;
  storageName: string;
  storageRelPath: string;
  mimeType: string;
  extension: string;
  size: number;
  checksumSha256: string;
  mediaMetadata?: FileMediaMetadata;
  thumbnailStatus: "pending" | "ready" | "failed" | "not_applicable";
  thumbnailRelPath?: string | null;
  thumbnailError?: string | null;
  previewStatus: "pending" | "ready" | "failed" | "not_applicable";
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  trashBatch?: string | null;
  isTrashRoot?: boolean;
  createdAt: Date;
  updatedAt: Date;
  uploadedVia?: "web" | "camera";
}

const FileSchema = new Schema<IFile>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, maxlength: 255 },
    nameKey: { type: String, required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Folder", default: null, index: true },
    storageName: { type: String, required: true, unique: true },
    storageRelPath: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true, maxlength: 255 },
    extension: { type: String, required: true, maxlength: 32, index: true },
    size: { type: Number, required: true, min: 0 },
    checksumSha256: { type: String, required: true, index: true },
    mediaMetadata: {
      width: Number,
      height: Number,
      durationSeconds: Number,
      capturedAt: Date,
      hasExif: Boolean,
      format: String,
    },
    thumbnailStatus: {
      type: String,
      enum: ["pending", "ready", "failed", "not_applicable"],
      default: "not_applicable",
      index: true,
    },
    thumbnailRelPath: { type: String, default: null },
    thumbnailError: { type: String, default: null, maxlength: 1000 },
    previewStatus: {
      type: String,
      enum: ["pending", "ready", "failed", "not_applicable"],
      default: "not_applicable",
    },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    trashBatch: { type: String, default: null, index: true },
    isTrashRoot: { type: Boolean, default: false, index: true },
    uploadedVia: { type: String, enum: ["web", "camera"], default: "web" },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

FileSchema.index({ owner: 1, parentId: 1, deletedAt: 1 });
FileSchema.index({ parentId: 1, nameKey: 1, deletedAt: 1 });
FileSchema.index({ owner: 1, deletedAt: 1, size: -1 });
FileSchema.index({ owner: 1, checksumSha256: 1, size: 1, deletedAt: 1 });
FileSchema.index({ owner: 1, deletedAt: 1, createdAt: -1 });
FileSchema.index({ deletedAt: 1, deletedBy: 1 });
FileSchema.index({ owner: 1, mimeType: 1, deletedAt: 1 });

export const File: Model<IFile> =
  (models.File as Model<IFile> | undefined) ?? model<IFile>("File", FileSchema);
