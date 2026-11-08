import type { Types } from "mongoose";
import { AuditLog, type AuditSeverity } from "@/models/AuditLog";
import { logger } from "@/lib/logger";

interface AuditInput {
  actorId?: Types.ObjectId | string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  severity?: AuditSeverity;
  ipHash?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function auditEvent(input: AuditInput): Promise<void> {
  try {
    await AuditLog.create({
      actorId: input.actorId || null,
      actorEmail: input.actorEmail || null,
      action: input.action.slice(0, 100),
      targetType: input.targetType?.slice(0, 50) || null,
      targetId: input.targetId?.slice(0, 100) || null,
      severity: input.severity || "info",
      ipHash: input.ipHash || null,
      userAgent: input.userAgent?.slice(0, 500) || null,
      metadata: input.metadata || {},
    });
  } catch (error) {
    // Audit failures must not crash the user operation, but they are logged.
    logger.error("Failed to persist audit event", { error, action: input.action });
  }
}
