"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  Cloud,
  Download,
  Eye,
  FileQuestion,
  Folder,
  KeyRound,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { FilePreviewDialog } from "@/components/file-preview";
import { FileThumbnail } from "@/components/file-thumbnail";
import {
  ApiClientError,
  apiGet,
  apiPost,
  errorMessage,
} from "@/lib/api-client";
import { formatBytesClient, formatDate, itemIcon } from "@/lib/format";
import {
  publicContentUrl,
} from "@/lib/public-urls";
import type {
  FileItemDTO,
  PublicItemDTO,
  PublicShareInfo,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface PublicResponse {
  locked: boolean;
  info: PublicShareInfo;
  fileId?: string;
  folder?: {
    id: string;
    name: string;
    breadcrumbs: Array<{ id: string; name: string }>;
  };
  items?: PublicItemDTO[];
}

function categoryFor(item: PublicItemDTO | PublicShareInfo): FileItemDTO["category"] {
  const preview = item.previewKind;
  if (preview === "image") return "image";
  if (preview === "video") return "video";
  if (preview === "audio") return "audio";
  if (preview === "pdf" || preview === "text") return "document";
  const extension = item.extension || "";
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return "archive";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "txt", "md", "csv"].includes(extension)) {
    return "document";
  }
  return "other";
}

function toFileItem(item: PublicItemDTO): FileItemDTO {
  return {
    id: item.id,
    type: "file",
    name: item.name,
    parentId: item.parentId,
    role: "viewer",
    isOwner: false,
    canEdit: false,
    canShare: false,
    canDelete: false,
    isStarred: false,
    createdAt: item.updatedAt,
    updatedAt: item.updatedAt,
    mimeType: item.mimeType || "application/octet-stream",
    extension: item.extension || "",
    size: item.size || 0,
    category: categoryFor(item),
    thumbnailStatus: item.hasThumbnail ? "ready" : "not_applicable",
    previewKind: item.previewKind || "none",
  };
}

function fileInfoToItem(info: PublicShareInfo, fileId: string): FileItemDTO {
  const item: PublicItemDTO = {
    id: fileId,
    type: "file",
    name: info.name,
    parentId: null,
    size: info.size,
    mimeType: info.mimeType,
    extension: info.extension,
    previewKind: info.previewKind,
    hasThumbnail: Boolean(info.hasThumbnail),
    updatedAt: info.updatedAt,
  };
  return toFileItem(item);
}

function ShareShell({
  appName,
  children,
}: {
  appName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background via-background to-muted/50">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/20">
            <Cloud className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">{appName}</p>
            <p className="text-[11px] text-muted-foreground">Secure file sharing</p>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="border-t border-border/70 px-4 py-5 text-center text-xs text-muted-foreground">
        Shared securely from {appName}. Files are stored on the owner&apos;s private server.
      </footer>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <div>
          <h1 className="text-lg font-semibold">This link is unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The link may have expired, been revoked, or public sharing may be disabled.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function LoadingCard() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function PublicShareView({
  token,
  appName,
  initialFolderId,
}: {
  token: string;
  appName: string;
  initialFolderId?: string;
}) {
  const [data, setData] = React.useState<PublicResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [unlocking, setUnlocking] = React.useState(false);
  const [unlockError, setUnlockError] = React.useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = React.useState<string | null>(
    initialFolderId || null
  );
  const [selected, setSelected] = React.useState<FileItemDTO | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const requestRef = React.useRef(0);
  const topRef = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(
    async (folderId?: string | null) => {
      const requestId = ++requestRef.current;
      setLoading(true);
      setError(null);
      try {
        const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
        const response = await apiGet<PublicResponse>(
          `/api/public/${encodeURIComponent(token)}${query}`
        );
        if (requestId !== requestRef.current) return;
        setData(response);
        setActiveFolderId(folderId || null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        if (err instanceof ApiClientError && err.code === "PUBLIC_LOCKED") {
          setData((previous) => (previous ? { ...previous, locked: true, items: undefined } : previous));
          setPassword("");
        } else {
          setError(errorMessage(err));
        }
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [token]
  );

  React.useEffect(() => {
    void load(initialFolderId || null);
  }, [load, initialFolderId]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!password) {
      setUnlockError("Enter the password to continue.");
      return;
    }
    setUnlocking(true);
    setUnlockError(null);
    try {
      await apiPost(`/api/public/${encodeURIComponent(token)}/unlock`, { password });
      setPassword("");
      await load(activeFolderId);
    } catch (err) {
      setUnlockError(errorMessage(err));
    } finally {
      setUnlocking(false);
    }
  }

  function navigateToFolder(folderId: string | null) {
    const url = new URL(window.location.href);
    if (folderId) url.searchParams.set("folder", folderId);
    else url.searchParams.delete("folder");
    window.history.replaceState(null, "", url.toString());
    void load(folderId);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function preview(item: PublicItemDTO) {
    setSelected(toFileItem(item));
    setPreviewOpen(true);
  }

  if (loading && !data) {
    return (
      <ShareShell appName={appName}>
        <LoadingCard />
      </ShareShell>
    );
  }

  if (error || !data) {
    return (
      <ShareShell appName={appName}>
        <ErrorCard message={error || "The share could not be loaded."} />
      </ShareShell>
    );
  }

  const { info } = data;

  if (data.locked) {
    return (
      <ShareShell appName={appName}>
        <Card className="mx-auto max-w-md">
          <CardContent className="px-6 py-10">
            <div className="mb-6 flex flex-col items-center text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Lock className="h-7 w-7" />
              </span>
              <h1 className="break-words text-lg font-semibold">{info.name}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This {info.type === "folder" ? "folder" : "file"} is protected by a password.
              </p>
              {info.expiresAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Link expires {formatDate(info.expiresAt)}
                </p>
              ) : null}
            </div>
            <form onSubmit={unlock} className="space-y-3">
              <label htmlFor="share-password" className="sr-only">
                Password
              </label>
              <Input
                id="share-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                aria-invalid={Boolean(unlockError)}
              />
              {unlockError ? (
                <p className="text-xs text-destructive" role="alert">
                  {unlockError}
                </p>
              ) : null}
              <Button type="submit" className="w-full" loading={unlocking}>
                <KeyRound className="h-4 w-4" /> Unlock
              </Button>
            </form>
          </CardContent>
        </Card>
      </ShareShell>
    );
  }

  const file = info.type === "file" && data.fileId ? fileInfoToItem(info, data.fileId) : null;
  const folder = data.folder;
  const items = data.items || [];

  return (
    <ShareShell appName={appName}>
      <div ref={topRef} />
      {file ? (
        <div className="mx-auto max-w-2xl">
          <Card className="overflow-hidden">
            <div className="flex h-44 items-center justify-center border-b border-border bg-muted/40 sm:h-56">
              <FileThumbnail
                file={file}
                publicToken={token}
                fallbackToOriginal
                className="h-full w-full p-2"
              />
            </div>
            <CardContent className="space-y-5 px-5 py-6 sm:px-6">
              <div className="min-w-0">
                <h1 className="break-words text-xl font-semibold tracking-tight">{info.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatBytesClient(info.size || 0)} · {formatDate(info.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">Shared link</Badge>
                {info.requiresPassword ? (
                  <Badge variant="secondary">
                    <ShieldCheck className="mr-1 h-3 w-3" /> Password protected
                  </Badge>
                ) : null}
                {!info.allowDownload ? <Badge variant="muted">View only</Badge> : null}
                {info.expiresAt ? (
                  <Badge variant="warning">Expires {formatDate(info.expiresAt)}</Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {info.previewKind && info.previewKind !== "none" ? (
                  <Button
                    onClick={() => {
                      setSelected(file);
                      setPreviewOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4" /> Open preview
                  </Button>
                ) : null}
                {info.allowDownload ? (
                  <Button variant="outline" asChild>
                    <a href={publicContentUrl(token, file.id, true)}>
                      <Download className="h-4 w-4" /> Download
                    </a>
                  </Button>
                ) : null}
              </div>
              {!info.allowDownload && info.previewKind === "none" ? (
                <p className="text-sm text-muted-foreground">
                  Downloads are disabled and this file type cannot be previewed in the browser.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Folder className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="break-words text-lg font-semibold tracking-tight">
                  {folder?.name || info.name}
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Shared folder · {items.length} item{items.length === 1 ? "" : "s"}
                  {!info.allowDownload ? " · Downloads disabled" : ""}
                </p>
              </div>
              {info.requiresPassword ? (
                <Badge variant="secondary">
                  <ShieldCheck className="mr-1 h-3 w-3" /> Password protected
                </Badge>
              ) : null}
            </CardContent>
          </Card>

          {folder && folder.breadcrumbs.length > 0 ? (
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
              {folder.breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.id}>
                  {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (index === 0) navigateToFolder(null);
                      else if (crumb.id !== folder.id) navigateToFolder(crumb.id);
                    }}
                    className={cn(
                      "max-w-[14rem] truncate rounded px-1.5 py-0.5 hover:bg-accent",
                      index === folder.breadcrumbs.length - 1
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          ) : null}

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <FileQuestion className="h-9 w-9 text-muted-foreground" />
                <div>
                  <p className="font-medium">This folder is empty</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The owner has not added any files here yet.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((item) => {
                  if (item.type === "folder") {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigateToFolder(item.id)}
                        className="group flex h-36 flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
                      >
                        <span className="flex flex-1 items-center justify-center bg-muted/30 text-amber-500">
                          <Folder className="h-9 w-9" />
                        </span>
                        <span className="flex items-center gap-2 border-t border-border px-3 py-2.5">
                          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                          <span className="truncate text-sm font-medium">{item.name}</span>
                        </span>
                      </button>
                    );
                  }
                  const fileItem = toFileItem(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => preview(item)}
                      className="group flex h-36 flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
                    >
                      <span className="relative flex flex-1 items-center justify-center overflow-hidden bg-muted/30">
                        <FileThumbnail
                          file={fileItem}
                          publicToken={token}
                          fallbackToOriginal
                          className="h-full w-full"
                        />
                      </span>
                      <span className="flex items-center gap-2 border-t border-border px-3 py-2.5">
                        <span className="shrink-0 text-muted-foreground">
                          {itemIcon(fileItem, "h-4 w-4")}
                        </span>
                        <span className="truncate text-sm font-medium">{item.name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {items.length >= 500 ? (
                <p className="text-center text-xs text-muted-foreground">
                  Showing the first 500 entries in this folder.
                </p>
              ) : null}
            </>
          )}
        </div>
      )}

      <FilePreviewDialog
        file={selected}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        publicToken={token}
        allowDownload={info.allowDownload}
        footerLabel={`Shared via ${appName}`}
      />
    </ShareShell>
  );
}
