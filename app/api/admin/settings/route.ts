import { requireAdminMutation } from "@/lib/api-guard";
import { requireAdminUser } from "@/lib/auth-user";
import { auditEvent } from "@/lib/audit";
import { getSystemSettings, updateSystemSettings } from "@/lib/settings";
import { handleApiError, json, readJson } from "@/lib/request";
import { settingsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminUser();
    const settings = await getSystemSettings();
    return json({
      settings: {
        publicSharingEnabled: settings.publicSharingEnabled,
        trashRetentionDays: settings.trashRetentionDays,
        allowCameraUpload: settings.allowCameraUpload,
        updatedAt: settings.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdminMutation(request);
    const input = await readJson(request, settingsSchema);
    const settings = await updateSystemSettings(input);
    await auditEvent({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "admin.settings.updated",
      targetType: "system_setting",
      targetId: "global",
      severity: "security",
      metadata: {
        publicSharingEnabled: settings.publicSharingEnabled,
        trashRetentionDays: settings.trashRetentionDays,
        allowCameraUpload: settings.allowCameraUpload,
      },
    });
    return json({
      settings: {
        publicSharingEnabled: settings.publicSharingEnabled,
        trashRetentionDays: settings.trashRetentionDays,
        allowCameraUpload: settings.allowCameraUpload,
        updatedAt: settings.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
