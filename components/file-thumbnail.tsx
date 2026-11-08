"use client";

import * as React from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { categoryIcon } from "@/lib/format";
import { itemThumbnailUrl, publicThumbnailUrl } from "@/lib/public-urls";
import type { FileItemDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FileThumbnail({
  file,
  className,
  publicToken,
  fallbackToOriginal = false,
  showProcessing = false,
}: {
  file: FileItemDTO;
  className?: string;
  publicToken?: string;
  fallbackToOriginal?: boolean;
  showProcessing?: boolean;
}) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [file.id, file.thumbnailStatus]);

  const thumbUrl = publicToken
    ? publicThumbnailUrl(publicToken, file.id)
    : itemThumbnailUrl(file.id);
  const originalUrl = publicToken
    ? `/api/public/${encodeURIComponent(publicToken)}/content/${encodeURIComponent(file.id)}`
    : `/api/items/file/${encodeURIComponent(file.id)}/content`;

  if (file.thumbnailStatus === "ready" && !failed) {
    return (
      <img
        src={thumbUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn("h-full w-full object-cover", className)}
        onError={() => setFailed(true)}
      />
    );
  }

  if (fallbackToOriginal && file.previewKind === "image" && !failed) {
    return (
      <img
        src={originalUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn("h-full w-full object-cover", className)}
        onError={() => setFailed(true)}
      />
    );
  }

  if (file.thumbnailStatus === "pending" && showProcessing) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center text-muted-foreground", className)}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center text-muted-foreground",
        className
      )}
      aria-hidden="true"
    >
      {file.thumbnailStatus === "failed" ? (
        <ImageOff className="h-6 w-6 opacity-70" />
      ) : (
        categoryIcon(file.category, "h-7 w-7 opacity-80")
      )}
    </div>
  );
}
