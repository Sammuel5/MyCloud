import type { Metadata } from "next";
import { BrowseView } from "@/components/browse-view";

export const metadata: Metadata = { title: "Starred" };

export default function StarredPage() {
  return <BrowseView scope="starred" />;
}
