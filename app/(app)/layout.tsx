import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-user";
import { getQuotaState } from "@/lib/usage";
import { getSystemSettings } from "@/lib/settings";
import { getAppName } from "@/lib/config";
import { UserProvider } from "@/components/user-context";
import { UploadProvider } from "@/components/upload-manager";
import { AppShell } from "@/components/app-shell";
import type { MeResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  const [quota, settings] = await Promise.all([
    getQuotaState(user.id, user.storageQuotaBytes),
    getSystemSettings(),
  ]);
  const initialMe: MeResponse = {
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

  return (
    <UserProvider initialMe={initialMe}>
      <UploadProvider>
        <AppShell>{children}</AppShell>
      </UploadProvider>
    </UserProvider>
  );
}
