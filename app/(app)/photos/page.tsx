import type { Metadata } from "next";
import { MediaGallery } from "@/components/media-gallery";

export const metadata: Metadata = { title: "Photos" };

export default function PhotosPage() {
  return <MediaGallery kind="photos" />;
}
