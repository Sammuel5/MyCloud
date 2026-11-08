"use client";

import * as React from "react";
import {
  File,
  Folder,
  Link2,
  Loader2,
  Share2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShareDialog } from "@/components/share-dialog";
import { EmptyState } from "@/components/empty-state";
import { apiGet, errorMessage } from "@/lib/api-client";
import { formatBytesClient, formatRelative } from "@/lib/format";
import type { ItemDTO, OutgoingShareDTO } from "@/lib/types";
import { toast } from "sonner";

export function OutgoingShares() {
  const [shares, setShares] = React.useState<OutgoingShareDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openingId, setOpeningId] = React.useState<string | null>(null);
  const [shareTarget, setShareTarget] = React.useState<ItemDTO | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<{ shares: OutgoingShareDTO[] }>("/api/shares/outgoing");
      setShares(response.shares);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener("mycloud:changed", handler);
    return () => window.removeEventListener("mycloud:changed", handler);
  }, [load]);

  async function manage(share: OutgoingShareDTO) {
    setOpeningId(`${share.resourceType}:${share.resourceId}`);
    try {
      const response = await apiGet<{ item: ItemDTO }>(
        `/api/items/${share.resourceType}/${share.resourceId}`
      );
      setShareTarget(response.item);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <section aria-labelledby="outgoing-shares-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="outgoing-shares-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Share2 className="h-4 w-4 text-muted-foreground" /> Shared by you
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Items you have shared with other accounts or through a public link.
          </p>
        </div>
        <Badge variant="secondary">{shares.length} item{shares.length === 1 ? "" : "s"}</Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading outgoing shares…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
          {error}
          <Button variant="outline" size="sm" className="ml-3" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : shares.length === 0 ? (
        <EmptyState
          icon={Users}
          title="You haven't shared anything yet"
          description="Use the Share action on a file or folder to invite another account or create a public link."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shares.map((share) => {
            const key = `${share.resourceType}:${share.resourceId}`;
            return (
              <li
                key={key}
                className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {share.resourceType === "folder" ? (
                      <Folder className="h-5 w-5" />
                    ) : (
                      <File className="h-5 w-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={share.name}>
                      {share.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {share.resourceType === "folder"
                        ? "Folder"
                        : formatBytesClient(share.size || 0)}
                      {" · "}
                      {formatRelative(share.updatedAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {share.collaborators.slice(0, 4).map((person) => (
                    <Badge key={person.id} variant="secondary" title={person.email}>
                      {person.name} · {person.role}
                    </Badge>
                  ))}
                  {share.activeLinkCount > 0 ? (
                    <Badge variant="outline" className="gap-1">
                      <Link2 className="h-3 w-3" /> {share.activeLinkCount} link
                      {share.activeLinkCount === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {share.collaborators.length} collaborator
                    {share.collaborators.length === 1 ? "" : "s"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={openingId === key}
                    onClick={() => void manage(share)}
                  >
                    Manage access
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ShareDialog
        item={shareTarget}
        open={Boolean(shareTarget)}
        onOpenChange={(value) => {
          if (!value) setShareTarget(null);
        }}
      />
    </section>
  );
}
