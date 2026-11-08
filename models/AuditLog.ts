import { model, models, Schema, type Model, type Types } from "mongoose";

export type AuditSeverity = "info" | "warning" | "security";

export interface IAuditLog {
  _id: Types.ObjectId;
  actorId?: Types.ObjectId | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  severity: AuditSeverity;
  ipHash?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorEmail: { type: String, default: null, maxlength: 254 },
    action: { type: String, required: true, maxlength: 100, index: true },
    targetType: { type: String, default: null, maxlength: 50 },
    targetId: { type: String, default: null, maxlength: 100 },
    severity: {
      type: String,
      enum: ["info", "warning", "security"],
      default: "info",
      index: true,
    },
    ipHash: { type: String, default: null, maxlength: 128 },
    userAgent: { type: String, default: null, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ severity: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

export const AuditLog: Model<IAuditLog> =
  (models.AuditLog as Model<IAuditLog> | undefined) ??
  model<IAuditLog>("AuditLog", AuditLogSchema);
