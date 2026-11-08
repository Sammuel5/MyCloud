import type { Metadata } from "next";
import { BrowseView } from "@/components/browse-view";

export const metadata: Metadata = { title: "My Drive" };

export default function DrivePage() {
  return <BrowseView scope="drive" />;
}
