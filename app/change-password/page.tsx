import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-user";
import { getAppName } from "@/lib/config";
import { ChangePasswordForm } from "@/components/change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login");
  return <ChangePasswordForm appName={getAppName()} mustChange={user.mustChangePassword} />;
}
