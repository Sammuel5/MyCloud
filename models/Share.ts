import { model, models, Schema, type Model, type Types } from "mongoose";

export type ShareRole = "viewer" | "editor";
export type ResourceType = "file" | "folder";

export interface IShare {
  _id: Types.ObjectId;
  resourceType: ResourceType;
  resourceId: Types.ObjectId;
  owner: Types.ObjectId;
  sharedWith: Types.ObjectId;
  role: ShareRole;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ShareSchema = new Schema<IShare>(
  {
    resourceType: { type: String, enum: ["file", "folder"], required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true, refPath: "resourceType" },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sharedWith: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["viewer", "editor"], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ShareSchema.index(
  { resourceType: 1, resourceId: 1, sharedWith: 1 },
  { unique: true }
);
ShareSchema.index({ sharedWith: 1, resourceType: 1 });
ShareSchema.index({ owner: 1, createdAt: -1 });

export const Share: Model<IShare> =
  (models.Share as Model<IShare> | undefined) ?? model<IShare>("Share", ShareSchema);
