import type { Metadata } from "next";
import { BrowseView } from "@/components/browse-view";

export const metadata: Metadata = { title: "Recycle bin" };

export default function TrashPage() {
  return <BrowseView scope="trash" />;
}
