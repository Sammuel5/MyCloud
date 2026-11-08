import { model, models, Schema, type Model, type Types } from "mongoose";
import type { ResourceType } from "@/models/Share";

export interface IStar {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  itemType: ResourceType;
  itemId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StarSchema = new Schema<IStar>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemType: { type: String, enum: ["file", "folder"], required: true },
    itemId: { type: Schema.Types.ObjectId, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

StarSchema.index({ userId: 1, itemType: 1, itemId: 1 }, { unique: true });
StarSchema.index({ itemType: 1, itemId: 1 });

export const Star: Model<IStar> =
  (models.Star as Model<IStar> | undefined) ?? model<IStar>("Star", StarSchema);
