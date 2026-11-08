import type { Metadata } from "next";
import { getAppName } from "@/lib/config";
import { PublicShareView } from "@/components/public-share-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared item",
  robots: { index: false, follow: false },
};

export default function PublicSharePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { folder?: string };
}) {
  return (
    <PublicShareView
      token={params.token}
      appName={getAppName()}
      initialFolderId={searchParams.folder}
    />
  );
}
