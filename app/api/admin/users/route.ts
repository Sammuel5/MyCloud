import { requireAdminMutation } from "@/lib/api-guard";
import { requireAdminUser } from "@/lib/auth-user";
import { auditEvent } from "@/lib/audit";
import { createAdminUser, listAdminUsers } from "@/lib/admin";
import { queryObject } from "@/lib/api-guard";
import { handleApiError, json, readJson } from "@/lib/request";
import { adminCreateUserSchema, adminUsersQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminUser();
    const parsed = adminUsersQuerySchema.safeParse(queryObject(request));
    if (!parsed.success) {
      return json(
        { error: "Invalid user query", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const query = parsed.data;
    return json(
      await listAdminUsers({
        page: query.page,
        limit: query.limit,
        q: query.q,
        role: query.role,
        active: query.active ? query.active === "true" : undefined,
      })
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminMutation(request);
    const input = await readJson(request, adminCreateUserSchema);
    const user = await createAdminUser(actor.id, {
      name: input.name,
      email: input.email,
      password: input.password,
      role: input.role,
      quotaBytes: input.quotaBytes,
    });
    await auditEvent({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "admin.user.created",
      targetType: "user",
      targetId: user.id,
      severity: "security",
      metadata: { email: user.email, role: user.role, quotaBytes: user.storageQuotaBytes },
    });
    return json({ user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
