import { model, models, Schema, type Model, type Types } from "mongoose";

export interface IFolder {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  name: string;
  nameKey: string;
  parentId: Types.ObjectId | null;
  ancestorIds: Types.ObjectId[];
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  trashBatch?: string | null;
  isTrashRoot?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FolderSchema = new Schema<IFolder>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, maxlength: 255 },
    nameKey: { type: String, required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Folder", default: null, index: true },
    ancestorIds: [{ type: Schema.Types.ObjectId, ref: "Folder" }],
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    trashBatch: { type: String, default: null, index: true },
    isTrashRoot: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

FolderSchema.index({ owner: 1, parentId: 1, deletedAt: 1 });
FolderSchema.index({ parentId: 1, nameKey: 1, deletedAt: 1 });
FolderSchema.index({ owner: 1, ancestorIds: 1, deletedAt: 1 });
FolderSchema.index({ deletedAt: 1, deletedBy: 1 });

export const Folder: Model<IFolder> =
  (models.Folder as Model<IFolder> | undefined) ?? model<IFolder>("Folder", FolderSchema);
