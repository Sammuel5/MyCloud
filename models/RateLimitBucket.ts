import { model, models, Schema, type Model } from "mongoose";

export interface IRateLimitBucket {
  key: string;
  count: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RateLimitBucketSchema = new Schema<IRateLimitBucket>(
  {
    key: { type: String, required: true, unique: true, index: true },
    count: { type: Number, default: 1, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const RateLimitBucket: Model<IRateLimitBucket> =
  (models.RateLimitBucket as Model<IRateLimitBucket> | undefined) ??
  model<IRateLimitBucket>("RateLimitBucket", RateLimitBucketSchema);
