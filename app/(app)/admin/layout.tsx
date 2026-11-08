import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-user";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/drive");
  if (user.mustChangePassword) redirect("/change-password");
  return <>{children}</>;
}
