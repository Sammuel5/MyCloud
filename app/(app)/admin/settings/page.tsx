import type { Metadata } from "next";
import { AdminSettingsView } from "@/components/admin-settings-view";

export const metadata: Metadata = { title: "System settings" };

export default function AdminSettingsPage() {
  return <AdminSettingsView />;
}
