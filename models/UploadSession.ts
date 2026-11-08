import { model, models, Schema, type Model, type Types } from "mongoose";

export type UploadStatus = "uploading" | "assembling" | "completed" | "aborted";

export interface IUploadSession {
  _id: Types.ObjectId;
  uploadId: string;
  owner: Types.ObjectId;
  fingerprint: string;
  filename: string;
  nameKey: string;
  mimeType: string;
  extension: string;
  size: number;
  parentId: Types.ObjectId | null;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  tempRelPath: string;
  status: UploadStatus;
  completedFileId?: Types.ObjectId | null;
  expiresAt: Date;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UploadSessionSchema = new Schema<IUploadSession>(
  {
    uploadId: { type: String, required: true, unique: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fingerprint: { type: String, required: true, maxlength: 256 },
    filename: { type: String, required: true, maxlength: 255 },
    nameKey: { type: String, required: true },
    mimeType: { type: String, required: true, maxlength: 255 },
    extension: { type: String, required: true, maxlength: 32 },
    size: { type: Number, required: true, min: 0 },
    parentId: { type: Schema.Types.ObjectId, ref: "Folder", default: null },
    chunkSize: { type: Number, required: true },
    totalChunks: { type: Number, required: true, min: 1 },
    receivedChunks: { type: [Number], default: [] },
    tempRelPath: { type: String, required: true },
    status: {
      type: String,
      enum: ["uploading", "assembling", "completed", "aborted"],
      default: "uploading",
      index: true,
    },
    completedFileId: { type: Schema.Types.ObjectId, ref: "File", default: null },
    expiresAt: { type: Date, required: true, index: true },
    lastActivityAt: { type: Date, default: Date.now, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

UploadSessionSchema.index({ owner: 1, status: 1, expiresAt: 1 });
UploadSessionSchema.index({ owner: 1, fingerprint: 1, status: 1 });

export const UploadSession: Model<IUploadSession> =
  (models.UploadSession as Model<IUploadSession> | undefined) ??
  model<IUploadSession>("UploadSession", UploadSessionSchema);
