import { Types } from "mongoose";
import { requireAdminUser } from "@/lib/auth-user";
import { queryObject } from "@/lib/api-guard";
import { connectDB } from "@/lib/db";
import { AuditLog } from "@/models/AuditLog";
import { User } from "@/models/User";
import { handleApiError, json } from "@/lib/request";
import { auditQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  try {
    await requireAdminUser();
    const parsed = auditQuerySchema.safeParse(queryObject(request));
    if (!parsed.success) {
      return json(
        { error: "Invalid audit query", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const query = parsed.data;
    await connectDB();
    const filters: Record<string, unknown>[] = [];
    if (query.action?.trim()) {
      filters.push({ action: new RegExp(escapeRegex(query.action.trim()), "i") });
    }
    if (query.severity) filters.push({ severity: query.severity });
    if (query.actorId) filters.push({ actorId: new Types.ObjectId(query.actorId) });
    const filter = filters.length ? { $and: filters } : {};

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);
    const actorIds = [...new Set(logs.map((log) => log.actorId?.toString()).filter(Boolean))];
    const actors = await User.find({ _id: { $in: actorIds } })
      .select("_id name email")
      .lean();
    const actorMap = new Map(actors.map((actor) => [actor._id.toString(), actor]));

    return json({
      logs: logs.map((log) => {
        const actor = log.actorId ? actorMap.get(log.actorId.toString()) : null;
        return {
          id: log._id.toString(),
          actor: actor
            ? { id: actor._id.toString(), name: actor.name, email: actor.email }
            : log.actorEmail
              ? { id: null, name: null, email: log.actorEmail }
              : null,
          action: log.action,
          targetType: log.targetType,
          targetId: log.targetId,
          severity: log.severity,
          metadata: log.metadata || {},
          ipHash: log.ipHash,
          userAgent: log.userAgent,
          createdAt: log.createdAt.toISOString(),
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
