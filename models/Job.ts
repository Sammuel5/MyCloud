import { model, models, Schema, type Model } from "mongoose";

export type JobType = "thumbnail";
export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface IJob {
  _id: import("mongoose").Types.ObjectId;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt?: Date | null;
  completedAt?: Date | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    type: { type: String, enum: ["thumbnail"], required: true, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 3, min: 1 },
    availableAt: { type: Date, default: Date.now, index: true },
    lockedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastError: { type: String, default: null, maxlength: 2000 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

JobSchema.index({ status: 1, availableAt: 1 });
JobSchema.index({ status: 1, lockedAt: 1 });
JobSchema.index({ createdAt: -1 });

export const Job: Model<IJob> =
  (models.Job as Model<IJob> | undefined) ?? model<IJob>("Job", JobSchema);
