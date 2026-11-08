"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-client";
import { formatBytesClient, formatDate, itemIcon } from "@/lib/format";
import type { FileItemDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PreviewProps {
  file: FileItemDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position?: string;
  publicToken?: string;
  allowDownload?: boolean;
  footerLabel?: string;
}

function contentUrl(file: FileItemDTO, publicToken?: string): string {
  if (publicToken) {
    return `/api/public/${encodeURIComponent(publicToken)}/content/${file.id}`;
  }
  return `/api/items/file/${file.id}/content`;
}

function thumbnailUrl(file: FileItemDTO, publicToken?: string): string {
  if (publicToken) {
    return `/api/public/${encodeURIComponent(publicToken)}/thumbnail/${file.id}`;
  }
  return `/api/items/file/${file.id}/thumbnail`;
}

export function FilePreviewDialog({
  file,
  open,
  onOpenChange,
  onPrevious,
  onNext,
  position,
  publicToken,
  allowDownload = true,
  footerLabel,
}: PreviewProps) {
  const [text, setText] = React.useState<string | null>(null);
  const [textMeta, setTextMeta] = React.useState<{ truncated: boolean; size: number } | null>(null);
  const [textError, setTextError] = React.useState<string | null>(null);
  const [textLoading, setTextLoading] = React.useState(false);

  React.useEffect(() => {
    setText(null);
    setTextMeta(null);
    setTextError(null);
    if (!file || file.previewKind !== "text" || !open) return;
    let cancelled = false;
    setTextLoading(true);
    const url = publicToken
      ? `/api/public/${encodeURIComponent(publicToken)}/content/${file.id}`
      : `/api/items/file/${file.id}/text`;
    fetch(url, { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "Preview unavailable");
        }
        if (publicToken) {
          return {
            text: await response.text(),
            truncated: false,
            size: file.size,
          };
        }
        return (await response.json()) as { text: string; truncated: boolean; size: number };
      })
      .then((payload) => {
        if (cancelled) return;
        setText(payload.text);
        setTextMeta({ truncated: payload.truncated, size: payload.size });
      })
      .catch((error) => {
        if (!cancelled) setTextError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, open, publicToken]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && onPrevious) onPrevious();
      if (event.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onPrevious, onNext]);

  if (!file) return null;
  const url = contentUrl(file, publicToken);
  const isImage = file.previewKind === "image";
  const isVideo = file.previewKind === "video";
  const isAudio = file.previewKind === "audio";
  const isPdf = file.previewKind === "pdf";
  const canShowThumb = isImage && file.thumbnailStatus === "ready";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] w-[min(96vw,1100px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4 pr-12">
          <span className="mt-0.5 text-muted-foreground">{itemIcon(file, "h-5 w-5")}</span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">{file.name}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              {formatBytesClient(file.size)}
              {file.mediaMetadata?.width && file.mediaMetadata?.height
                ? ` · ${file.mediaMetadata.width} × ${file.mediaMetadata.height}`
                : ""}
              {file.mediaMetadata?.durationSeconds
                ? ` · ${Math.round(file.mediaMetadata.durationSeconds)}s`
                : ""}
              {" · "}
              {formatDate(file.createdAt)}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1">
            {onPrevious ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onPrevious}
                aria-label="Previous file"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : null}
            {onNext ? (
              <Button variant="ghost" size="icon-sm" onClick={onNext} aria-label="Next file">
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null}
            {position ? (
              <span className="px-1 text-xs tabular-nums text-muted-foreground">{position}</span>
            ) : null}
            <Button variant="outline" size="sm" asChild className="ml-1">
              {allowDownload ? (
                <a href={`${url}?download=1`}>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              ) : (
                <span className="cursor-not-allowed opacity-60">
                  <Download className="h-3.5 w-3.5" /> Downloads off
                </span>
              )}
            </Button>
          </div>
        </div>

        <div className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-auto bg-slate-950/95 p-2 sm:p-4">
          {isImage ? (
            <img
              key={`${file.id}-full`}
              src={url}
              alt={file.name}
              className="mx-auto max-h-[74vh] max-w-full rounded object-contain"
              onError={(event) => {
                event.currentTarget.style.display = "none";
                if (canShowThumb) {
                  const parent = event.currentTarget.parentElement;
                  if (parent) {
                    const fallback = document.createElement("img");
                    fallback.src = thumbnailUrl(file, publicToken);
                    fallback.alt = file.name;
                    fallback.className = "mx-auto max-h-[74vh] max-w-full rounded object-contain";
                    parent.appendChild(fallback);
                  }
                }
              }}
            />
          ) : isVideo ? (
            <video
              key={file.id}
              src={url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              poster={file.thumbnailStatus === "ready" ? thumbnailUrl(file, publicToken) : undefined}
              className="mx-auto max-h-[74vh] max-w-full rounded"
            >
              Your browser cannot play this video.
            </video>
          ) : isAudio ? (
            <div className="w-full max-w-xl rounded-xl bg-slate-900 p-6 text-white shadow-xl">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
                  {itemIcon(file, "h-6 w-6")}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-xs text-slate-400">{formatBytesClient(file.size)}</p>
                </div>
              </div>
              <audio src={url} controls autoPlay className="w-full">
                Your browser cannot play this audio.
              </audio>
            </div>
          ) : isPdf ? (
            <iframe
              key={file.id}
              src={url}
              title={file.name}
              className="h-[76vh] w-full rounded bg-white"
            />
          ) : file.previewKind === "text" ? (
            <div className="h-full w-full">
              {textLoading ? (
                <div className="flex h-60 items-center justify-center text-slate-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading preview…
                </div>
              ) : textError ? (
                <div className="flex h-60 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-300">
                  <p>{textError}</p>
                  {allowDownload ? (
                    <Button variant="secondary" size="sm" asChild>
                      <a href={`${url}?download=1`}>
                        <Download className="h-3.5 w-3.5" /> Download instead
                      </a>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="h-[74vh] overflow-auto rounded bg-slate-900 p-5 text-left scrollbar-thin">
                  {textMeta?.truncated ? (
                    <p className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                      Showing the first 200 KB of this file. Download it to see the rest.
                    </p>
                  ) : null}
                  <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-slate-200">
                    {text}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center text-slate-300">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
                {itemIcon(file, "h-8 w-8")}
              </span>
              <div>
                <p className="font-medium text-white">No in-browser preview</p>
                <p className="mt-1 max-w-sm text-sm text-slate-400">
                  {allowDownload
                    ? "This file type is kept safe by downloading it and opening it in a trusted desktop application."
                    : "This file type cannot be shown in the browser, and downloads are disabled for this link."}
                </p>
              </div>
              {allowDownload ? (
                <Button asChild>
                  <a href={`${url}?download=1`}>
                    <Download className="h-4 w-4" /> Download file
                  </a>
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-card px-5 py-2 text-xs text-muted-foreground">
          <span className="truncate">
            {footerLabel || (file.isOwner ? "You own this file" : `Shared by ${file.ownerName || "another user"}`)}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn("flex items-center gap-1 rounded px-2 py-1 hover:bg-accent")}
          >
            <X className="h-3.5 w-3.5" /> Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
