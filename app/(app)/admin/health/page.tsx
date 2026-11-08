import type { Metadata } from "next";
import { AdminHealthView } from "@/components/admin-health-view";

export const metadata: Metadata = { title: "Health & jobs" };

export default function AdminHealthPage() {
  return <AdminHealthView />;
}
