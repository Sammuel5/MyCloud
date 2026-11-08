import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-user";
import { getAppName } from "@/lib/config";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; changed?: string };
}) {
  const user = await getCurrentUser().catch(() => null);
  if (user) {
    redirect(user.mustChangePassword ? "/change-password" : "/drive");
  }
  const callbackUrl =
    searchParams.callbackUrl && searchParams.callbackUrl.startsWith("/")
      ? searchParams.callbackUrl
      : "/drive";
  return (
    <LoginForm
      appName={getAppName()}
      callbackUrl={callbackUrl}
      passwordChanged={searchParams.changed === "1"}
    />
  );
}
