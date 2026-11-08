"use client";

import * as React from "react";
import { Image, Images, Loader2, Play, RefreshCw, Video } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { FilePreviewDialog } from "@/components/file-preview";
import { FileThumbnail } from "@/components/file-thumbnail";
import { UploadButton } from "@/components/upload-button";
import { Button } from "@/components/ui/button";
import { apiGet, errorMessage } from "@/lib/api-client";
import { formatBytesClient, formatShortDate } from "@/lib/format";
import type { FileItemDTO, MediaResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MediaGallery({ kind }: { kind: "photos" | "videos" }) {
  const [items, setItems] = React.useState<FileItemDTO[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<MediaResponse>(`/api/media?kind=${kind}&page=1&limit=60`)
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setTotal(response.total);
        setPage(1);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, refreshToken]);

  React.useEffect(() => {
    const handler = () => setRefreshToken((value) => value + 1);
    window.addEventListener("mycloud:changed", handler);
    return () => window.removeEventListener("mycloud:changed", handler);
  }, []);

  React.useEffect(() => {
    setPreviewId(null);
  }, [kind]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const response = await apiGet<MediaResponse>(
        `/api/media?kind=${kind}&page=${next}&limit=60`
      );
      setItems((previous) => {
        const known = new Set(previous.map((item) => item.id));
        return [...previous, ...response.items.filter((item) => !known.has(item.id))];
      });
      setTotal(response.total);
      setPage(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  const previewIndex = items.findIndex((item) => item.id === previewId);
  const preview = previewIndex >= 0 ? items[previewIndex] : null;
  const isPhotos = kind === "photos";
  const title = isPhotos ? "Photos" : "Videos";
  const Icon = isPhotos ? Images : Video;

  function previous() {
    if (items.length === 0) return;
    setPreviewId(items[(previewIndex - 1 + items.length) % items.length].id);
  }

  function next() {
    if (items.length === 0) return;
    setPreviewId(items[(previewIndex + 1) % items.length].id);
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={
          isPhotos
            ? "Every photo you can access, newest first. Thumbnails are generated locally."
            : "Videos from your drive with on-demand streaming and thumbnail previews."
        }
        icon={<Icon className="h-5 w-5" />}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setRefreshToken((value) => value + 1)}
              aria-label={`Refresh ${kind}`}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <UploadButton parentId={null} size="sm" label="Upload" />
          </>
        }
      />

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setRefreshToken((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      ) : loading ? (
        <div
          className={cn(
            "grid gap-2",
            isPhotos
              ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          )}
        >
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index}
              className={cn(
                "animate-pulse rounded-xl border border-border bg-card",
                isPhotos ? "aspect-square" : "aspect-video"
              )}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={isPhotos ? Image : Video}
          title={isPhotos ? "No photos yet" : "No videos yet"}
          description={
            isPhotos
              ? "Upload photos to your drive and they will appear here automatically."
              : "Upload a video to your drive to watch it here with streaming playback."
          }
          action={<UploadButton parentId={null} label="Upload files" />}
        />
      ) : (
        <>
          <div
            className={cn(
              "grid gap-2",
              isPhotos
                ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            )}
          >
            {items.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => setPreviewId(file.id)}
                className="group relative overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm outline-none transition-all hover:border-primary/30 hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring"
                title={file.name}
              >
                <div
                  className={cn(
                    "relative w-full overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800",
                    isPhotos ? "aspect-square" : "aspect-video"
                  )}
                >
                  <FileThumbnail
                    file={file}
                    fallbackToOriginal={isPhotos}
                    showProcessing={isPhotos}
                  />
                  {!isPhotos ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm transition-transform group-hover:scale-105">
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      </span>
                    </span>
                  ) : null}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 pt-8">
                    <span className="block truncate text-xs font-medium text-white">
                      {file.name}
                    </span>
                    <span className="block text-[10px] text-white/70">
                      {formatShortDate(file.mediaMetadata?.capturedAt || file.createdAt)}
                      {file.mediaMetadata?.durationSeconds
                        ? ` · ${Math.floor(file.mediaMetadata.durationSeconds / 60)}:${String(
                            Math.round(file.mediaMetadata.durationSeconds % 60)
                          ).padStart(2, "0")}`
                        : isPhotos
                          ? ""
                          : ` · ${formatBytesClient(file.size)}`}
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Showing {items.length.toLocaleString()} of {total.toLocaleString()} {kind}
            </p>
            {items.length < total ? (
              <Button variant="outline" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            ) : null}
          </div>
        </>
      )}

      <FilePreviewDialog
        file={preview}
        open={Boolean(preview)}
        onOpenChange={(value) => {
          if (!value) setPreviewId(null);
        }}
        onPrevious={items.length > 1 ? previous : undefined}
        onNext={items.length > 1 ? next : undefined}
        position={preview ? `${previewIndex + 1} / ${items.length}` : undefined}
      />
    </div>
  );
}
