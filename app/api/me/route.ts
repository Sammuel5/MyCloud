import { getCurrentUser, requireApiUser } from "@/lib/auth-user";
import { assertSameOrigin, handleApiError, json, readJson } from "@/lib/request";
import { profileSchema } from "@/lib/validation";
import { getQuotaState } from "@/lib/usage";
import { getSystemSettings } from "@/lib/settings";
import { getAppName } from "@/lib/config";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { auditEvent } from "@/lib/audit";
import type { MeResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser();
    const [quota, settings] = await Promise.all([
      getQuotaState(user.id, user.storageQuotaBytes),
      getSystemSettings(),
    ]);
    const response: MeResponse = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt.toISOString(),
      },
      appName: getAppName(),
      quota,
      settings: {
        publicSharingEnabled: settings.publicSharingEnabled,
        allowCameraUpload: settings.allowCameraUpload,
        trashRetentionDays: settings.trashRetentionDays,
      },
    };
    return json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const input = await readJson(request, profileSchema);
    await connectDB();
    await User.updateOne({ _id: user.id }, { $set: { name: input.name } });
    await auditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "profile.updated",
      severity: "info",
    });
    const refreshed = await getCurrentUser();
    return json({ user: refreshed ? { name: refreshed.name } : { name: input.name } });
  } catch (error) {
    return handleApiError(error);
  }
}
