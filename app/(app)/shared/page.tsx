import type { Metadata } from "next";
import { BrowseView } from "@/components/browse-view";
import { OutgoingShares } from "@/components/outgoing-shares";

export const metadata: Metadata = { title: "Shared" };

export default function SharedPage() {
  return (
    <div className="space-y-10">
      <BrowseView scope="shared-with-me" />
      <OutgoingShares />
    </div>
  );
}
