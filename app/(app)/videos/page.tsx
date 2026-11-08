import type { Metadata } from "next";
import { MediaGallery } from "@/components/media-gallery";

export const metadata: Metadata = { title: "Videos" };

export default function VideosPage() {
  return <MediaGallery kind="videos" />;
}
