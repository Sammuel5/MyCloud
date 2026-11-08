import { model, models, Schema, type Model, type Types } from "mongoose";

export type UserRole = "admin" | "user";

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
  storageQuotaBytes: number;
  sessionVersion: number;
  lastLoginAt?: Date | null;
  createdBy?: Types.ObjectId | null;
  failedLoginCount?: number;
  lockedUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "user"], default: "user", required: true },
    active: { type: Boolean, default: true, required: true },
    mustChangePassword: { type: Boolean, default: false, required: true },
    storageQuotaBytes: { type: Number, default: 0, min: 0, required: true },
    sessionVersion: { type: Number, default: 1, required: true },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    failedLoginCount: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

UserSchema.index({ role: 1, active: 1 });

export const User: Model<IUser> =
  (models.User as Model<IUser> | undefined) ?? model<IUser>("User", UserSchema);
