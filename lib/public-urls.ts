export function itemContentUrl(type: "file" | "folder", id: string, download = false): string {
  if (type !== "file") return "#";
  return `/api/items/file/${encodeURIComponent(id)}/content${download ? "?download=1" : ""}`;
}

export function itemThumbnailUrl(id: string): string {
  return `/api/items/file/${encodeURIComponent(id)}/thumbnail`;
}

export function publicContentUrl(token: string, fileId: string, download = false): string {
  return `/api/public/${encodeURIComponent(token)}/content/${encodeURIComponent(fileId)}${
    download ? "?download=1" : ""
  }`;
}

export function publicThumbnailUrl(token: string, fileId: string): string {
  return `/api/public/${encodeURIComponent(token)}/thumbnail/${encodeURIComponent(fileId)}`;
}

export function shareUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
