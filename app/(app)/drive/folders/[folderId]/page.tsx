import type { Metadata } from "next";
import { BrowseView } from "@/components/browse-view";

export const metadata: Metadata = { title: "Folder" };

export default function FolderPage({ params }: { params: { folderId: string } }) {
  return <BrowseView scope="drive" parentId={params.folderId} />;
}
