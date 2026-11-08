import type { Metadata } from "next";
import { BrowseView } from "@/components/browse-view";

export const metadata: Metadata = { title: "Recent" };

export default function RecentPage() {
  return <BrowseView scope="recent" />;
}
