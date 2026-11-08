import { model, models, Schema, type Model, type Types } from "mongoose";

export interface IUserSession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  sidHash: string;
  userAgent: string;
  ipHash: string;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSessionSchema = new Schema<IUserSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sidHash: { type: String, required: true, unique: true, index: true },
    userAgent: { type: String, default: "", maxlength: 500 },
    ipHash: { type: String, default: "unknown", maxlength: 128 },
    lastSeenAt: { type: Date, default: Date.now, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

UserSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

export const UserSession: Model<IUserSession> =
  (models.UserSession as Model<IUserSession> | undefined) ??
  model<IUserSession>("UserSession", UserSessionSchema);
