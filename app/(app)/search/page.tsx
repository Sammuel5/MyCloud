import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { BrowseView } from "@/components/browse-view";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = (searchParams.q || "").trim();

  if (!query) {
    return (
      <div>
        <PageHeader
          title="Search"
          description="Search across every file and folder you can access."
        />
        <EmptyState
          icon={SearchX}
          title="What are you looking for?"
          description="Type a file or folder name into the search bar at the top of the page and press Enter."
        />
      </div>
    );
  }

  return <BrowseView scope="search" query={query} />;
}
