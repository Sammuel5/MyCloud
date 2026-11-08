import { requireAdminMutation } from "@/lib/api-guard";
import { requireAdminUser } from "@/lib/auth-user";
import { auditEvent } from "@/lib/audit";
import {
  deactivateAdminUser,
  getUserAdminDetail,
  getUserOperationalSummary,
  updateAdminUser,
} from "@/lib/admin";
import { handleApiError, json, readJson } from "@/lib/request";
import { adminUpdateUserSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    await requireAdminUser();
    const [user, summary] = await Promise.all([
      getUserAdminDetail(params.userId),
      getUserOperationalSummary(params.userId),
    ]);
    return json({ user, summary });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const actor = await requireAdminMutation(request);
    const input = await readJson(request, adminUpdateUserSchema);
    const user = await updateAdminUser(actor.id, params.userId, input);
    await auditEvent({
      actorId: actor.id,
      actorEmail: actor.email,
      action: input.newPassword ? "admin.user.password_reset" : "admin.user.updated",
      targetType: "user",
      targetId: user.id,
      severity: "security",
      metadata: {
        email: user.email,
        role: user.role,
        active: user.active,
        quotaBytes: user.storageQuotaBytes,
        passwordReset: Boolean(input.newPassword),
      },
    });
    return json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const actor = await requireAdminMutation(request);
    await deactivateAdminUser(actor.id, params.userId);
    await auditEvent({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "admin.user.deactivated",
      targetType: "user",
      targetId: params.userId,
      severity: "security",
    });
    return json({ deactivated: true });
  } catch (error) {
    return handleApiError(error);
  }
}
