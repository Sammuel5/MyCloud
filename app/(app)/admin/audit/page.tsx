import type { Metadata } from "next";
import { AdminAuditView } from "@/components/admin-audit-view";

export const metadata: Metadata = { title: "Audit log" };

export default function AdminAuditPage() {
  return <AdminAuditView />;
}
