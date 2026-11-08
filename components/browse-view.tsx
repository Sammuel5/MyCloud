"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileQuestion,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  SearchX,
  Share2,
  Star,
  StarOff,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { FileThumbnail } from "@/components/file-thumbnail";
import { ContextMenu, type ContextMenuAction } from "@/components/context-menu";
import { ShareDialog } from "@/components/share-dialog";
import {
  ConfirmDialog,
  MoveDialog,
  NewFolderDialog,
  RenameDialog,
} from "@/components/item-dialogs";
import { FilePreviewDialog } from "@/components/file-preview";
import { UploadButton } from "@/components/upload-button";
import { useUploads } from "@/components/upload-manager";
import { useUser } from "@/components/user-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { apiDelete, apiGet, apiPost, errorMessage } from "@/lib/api-client";
import {
  formatBytesClient,
  formatDate,
  formatRelative,
  itemIcon,
} from "@/lib/format";
import { itemContentUrl } from "@/lib/public-urls";
import type {
  FileCategory,
  FileItemDTO,
  ItemDTO,
  ItemsResponse,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type BrowseScope =
  | "drive"
  | "starred"
  | "recent"
  | "search"
  | "trash"
  | "shared-with-me";

type BatchAction = "trash" | "restore" | "permanent" | "move" | "star" | "unstar";
type ViewMode = "grid" | "list";
type SortValue = "name-asc" | "name-desc" | "date-desc" | "date-asc" | "size-desc" | "type-asc";

interface BatchResponse {
  ok: boolean;
  succeeded: number;
  failed: number;
  results: Array<{ type: "file" | "folder"; id: string; ok: boolean; error?: string; code?: string }>;
}

interface ConfirmState {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive: boolean;
  action: () => Promise<void>;
}

function isFile(item: ItemDTO): item is FileItemDTO {
  return item.type === "file";
}

function itemKey(item: ItemDTO): string {
  return `${item.type}:${item.id}`;
}

function parseSort(value: SortValue): {
  sort: "name" | "date" | "size" | "type";
  order: "asc" | "desc";
} {
  switch (value) {
    case "date-desc":
      return { sort: "date", order: "desc" };
    case "date-asc":
      return { sort: "date", order: "asc" };
    case "size-desc":
      return { sort: "size", order: "desc" };
    case "type-asc":
      return { sort: "type", order: "asc" };
    case "name-desc":
      return { sort: "name", order: "desc" };
    case "name-asc":
    default:
      return { sort: "name", order: "asc" };
  }
}

function downloadItem(item: ItemDTO): void {
  if (item.type !== "file") return;
  const anchor = document.createElement("a");
  anchor.href = itemContentUrl("file", item.id, true);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function BrowseView({
  scope,
  parentId = null,
  query,
  title,
  description,
}: {
  scope: BrowseScope;
  parentId?: string | null;
  query?: string;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const { me } = useUser();
  const { queueFiles } = useUploads();
  const [data, setData] = React.useState<ItemsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [sortValue, setSortValue] = React.useState<SortValue>(
    scope === "recent" || scope === "trash" ? "date-desc" : "name-asc"
  );
  const [category, setCategory] = React.useState<FileCategory | "all">("all");
  const [view, setView] = React.useState<ViewMode>("grid");
  const [trashQuery, setTrashQuery] = React.useState("");
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [dragActive, setDragActive] = React.useState(false);
  const dragDepth = React.useRef(0);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<ItemDTO | null>(null);
  const [shareTarget, setShareTarget] = React.useState<ItemDTO | null>(null);
  const [newFolderOpen, setNewFolderOpen] = React.useState(false);
  const [confirmState, setConfirmState] = React.useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    item: ItemDTO;
  } | null>(null);
  const [transfer, setTransfer] = React.useState<{
    mode: "move" | "copy";
    items: ItemDTO[];
  } | null>(null);

  const { sort, order } = parseSort(sortValue);
  const isTrash = scope === "trash";
  const isDrive = scope === "drive";
  const canUpload = isDrive && (!data?.parent || data.parent.role !== "viewer");
  const canCreateFolder = isDrive && (!data?.parent || data.parent.role !== "viewer");
  const folderId = parentId || null;

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem("mycloud:view");
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      // Local storage can be unavailable in hardened browser modes.
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem("mycloud:view", view);
    } catch {
      // Ignore storage failures.
    }
  }, [view]);

  React.useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [scope, folderId, query, sortValue, category]);

  React.useEffect(() => {
    const handler = () => setRefreshToken((value) => value + 1);
    window.addEventListener("mycloud:changed", handler);
    return () => window.removeEventListener("mycloud:changed", handler);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("scope", scope);
    params.set("page", String(page));
    params.set("limit", "50");
    params.set("sort", sort);
    params.set("order", order);
    params.set("category", category);
    if (folderId) params.set("parentId", folderId);
    if (scope === "search" && query) params.set("q", query);
    if (scope === "trash" && trashQuery.trim()) params.set("q", trashQuery.trim());

    setLoading(true);
    setError(null);
    apiGet<ItemsResponse>(`/api/items?${params.toString()}`)
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        setSelected((previous) => {
          if (previous.size === 0) return previous;
          const available = new Set(response.items.map(itemKey));
          const next = new Set([...previous].filter((key) => available.has(key)));
          return next.size === previous.size ? previous : next;
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [scope, folderId, query, page, sort, order, category, trashQuery, refreshToken]);

  React.useEffect(() => {
    if (!data || loading || page <= 1 || data.items.length > 0) return;
    setPage((value) => Math.max(1, value - 1));
  }, [data, loading, page]);

  const items = React.useMemo(() => data?.items ?? [], [data]);
  const previewFiles = React.useMemo(() => items.filter(isFile), [items]);
  const previewFile = React.useMemo(
    () => previewFiles.find((file) => file.id === previewId) || null,
    [previewFiles, previewId]
  );
  const previewIndex = previewFiles.findIndex((file) => file.id === previewId);

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  function notifyChanged() {
    window.dispatchEvent(new CustomEvent("mycloud:changed"));
  }

  function toggleSelect(item: ItemDTO) {
    setSelected((previous) => {
      const next = new Set(previous);
      const key = itemKey(item);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(items.map(itemKey)));
  }

  function openItem(item: ItemDTO) {
    if (item.type === "folder") {
      router.push(`/drive/folders/${item.id}`);
    } else {
      setPreviewId(item.id);
    }
  }

  function showPreviousPreview() {
    if (previewIndex <= 0) {
      setPreviewId(previewFiles[previewFiles.length - 1]?.id || null);
    } else {
      setPreviewId(previewFiles[previewIndex - 1]?.id || null);
    }
  }

  function showNextPreview() {
    if (previewIndex < 0 || previewIndex >= previewFiles.length - 1) {
      setPreviewId(previewFiles[0]?.id || null);
    } else {
      setPreviewId(previewFiles[previewIndex + 1]?.id || null);
    }
  }

  async function runBatch(
    action: BatchAction,
    targets: ItemDTO[],
    destinationParentId?: string | null
  ): Promise<BatchResponse> {
    if (targets.length === 0) {
      return { ok: true, succeeded: 0, failed: 0, results: [] };
    }
    return apiPost<BatchResponse>("/api/items/batch", {
      action,
      items: targets.map((item) => ({ type: item.type, id: item.id })),
      ...(destinationParentId !== undefined ? { parentId: destinationParentId } : {}),
    });
  }

  function reportBatch(action: BatchAction, response: BatchResponse): void {
    const label =
      action === "trash"
        ? "moved to recycle bin"
        : action === "restore"
          ? "restored"
          : action === "permanent"
            ? "deleted permanently"
            : action === "move"
              ? "moved"
              : action === "star"
                ? "starred"
                : "unstarred";
    if (response.failed === 0) {
      toast.success(
        response.succeeded === 1 ? `Item ${label}` : `${response.succeeded} items ${label}`
      );
      return;
    }
    if (response.succeeded === 0) {
      toast.error(response.results.find((result) => !result.ok)?.error || "Operation failed");
      return;
    }
    toast.warning(`${response.succeeded} ${label}, ${response.failed} failed`);
  }

  async function executeBatch(
    action: BatchAction,
    targets: ItemDTO[],
    destinationParentId?: string | null
  ): Promise<void> {
    try {
      const response = await runBatch(action, targets, destinationParentId);
      reportBatch(action, response);
      setSelected(new Set());
      notifyChanged();
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  }

  function confirmTrash(targets: ItemDTO[]) {
    setConfirmState({
      title:
        targets.length === 1 ? `Move “${targets[0].name}” to trash?` : `Move ${targets.length} items to trash?`,
      description:
        "Items stay in the recycle bin until the retention period ends. You can restore them from there.",
      confirmLabel: "Move to trash",
      destructive: true,
      action: async () => {
        await executeBatch("trash", targets);
      },
    });
  }

  function confirmPermanent(targets: ItemDTO[]) {
    setConfirmState({
      title: targets.length === 1 ? "Delete permanently?" : `Delete ${targets.length} items permanently?`,
      description: (
        <>
          <strong className="text-foreground">This cannot be undone.</strong> Files and their
          thumbnails will be removed from disk and all sharing links will stop working.
        </>
      ),
      confirmLabel: "Delete forever",
      destructive: true,
      action: async () => {
        await executeBatch("permanent", targets);
      },
    });
  }

  async function onConfirmAction() {
    if (!confirmState) return;
    setConfirmLoading(true);
    try {
      await confirmState.action();
      setConfirmState(null);
    } catch {
      // The action already surfaced a toast; keep the dialog open for a retry.
    } finally {
      setConfirmLoading(false);
    }
  }

  async function toggleStar(item: ItemDTO) {
    try {
      if (item.isStarred) {
        await apiDelete(`/api/items/${item.type}/${item.id}/star`);
      } else {
        await apiPost(`/api/items/${item.type}/${item.id}/star`);
      }
      toast.success(item.isStarred ? "Removed from starred" : "Added to starred");
      notifyChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function downloadSelected() {
    const files = selectedItems().filter(isFile);
    if (files.length === 0) {
      toast.error("Select at least one file to download.");
      return;
    }
    files.forEach((file, index) => {
      window.setTimeout(() => downloadItem(file), index * 350);
    });
    if (files.length > 1) {
      toast.info("Your browser may ask to allow multiple downloads.");
    }
  }

  function selectedItems(): ItemDTO[] {
    return items.filter((item) => selected.has(itemKey(item)));
  }

  async function onTransferConfirm(destination: string | null) {
    if (!transfer) return;
    if (transfer.mode === "move") {
      const response = await runBatch("move", transfer.items, destination);
      reportBatch("move", response);
      setTransfer(null);
      setSelected(new Set());
      notifyChanged();
      return;
    }

    let succeeded = 0;
    let failed = 0;
    let lastError = "";
    for (const item of transfer.items) {
      try {
        await apiPost(`/api/items/${item.type}/${item.id}/copy`, { parentId: destination });
        succeeded += 1;
      } catch (err) {
        failed += 1;
        lastError = errorMessage(err);
      }
    }
    if (succeeded > 0) {
      toast.success(succeeded === 1 ? "Copy created" : `${succeeded} copies created`);
    }
    if (failed > 0) {
      toast.error(`${failed} copy operation${failed === 1 ? "" : "s"} failed. ${lastError}`);
    }
    if (failed === transfer.items.length) {
      throw new Error(lastError || "Copy failed");
    }
    setTransfer(null);
    setSelected(new Set());
    notifyChanged();
  }

  function contextActions(item: ItemDTO): ContextMenuAction[] {
    const actions: ContextMenuAction[] = [];
    if (!isTrash) {
      actions.push({
        label: item.type === "folder" ? "Open folder" : "Preview",
        icon: item.type === "folder" ? FolderOpen : Eye,
        onSelect: () => openItem(item),
      });
      if (isFile(item)) {
        actions.push({
          label: "Download",
          icon: Download,
          onSelect: () => downloadItem(item),
        });
      }
      const inCurrentFolder = isDrive && (item.parentId || null) === folderId;
      if (item.parentId && !inCurrentFolder) {
        actions.push({
          label: "Go to containing folder",
          icon: FolderSearch,
          onSelect: () => router.push(`/drive/folders/${item.parentId}`),
        });
      }
      actions.push({
        label: item.isStarred ? "Remove from starred" : "Add to starred",
        icon: item.isStarred ? StarOff : Star,
        onSelect: () => void toggleStar(item),
      });
      if (item.canEdit) {
        actions.push(
          {
            label: "Rename",
            icon: Pencil,
            separatorBefore: true,
            onSelect: () => setRenameTarget(item),
          },
          {
            label: "Move to…",
            icon: FolderOpen,
            onSelect: () => setTransfer({ mode: "move", items: [item] }),
          }
        );
      }
      actions.push({
        label: "Copy to…",
        icon: Copy,
        onSelect: () => setTransfer({ mode: "copy", items: [item] }),
      });
      if (item.canShare) {
        actions.push({
          label: "Share",
          icon: Share2,
          onSelect: () => setShareTarget(item),
        });
      }
      if (item.canDelete) {
        actions.push({
          label: "Move to trash",
          icon: Trash2,
          destructive: true,
          separatorBefore: true,
          onSelect: () => confirmTrash([item]),
        });
      }
    } else {
      actions.push(
        {
          label: "Restore",
          icon: RotateCcw,
          onSelect: () => void executeBatch("restore", [item]).catch(() => undefined),
        },
        {
          label: "Delete permanently",
          icon: Trash2,
          destructive: true,
          separatorBefore: true,
          onSelect: () => confirmPermanent([item]),
        }
      );
    }
    return actions;
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragActive(false);
    if (!canUpload) {
      toast.error("You do not have upload permission in this folder.");
      return;
    }
    if (event.dataTransfer.files.length > 0) {
      queueFiles(event.dataTransfer.files, folderId);
    }
  }

  const heading =
    title ||
    (isDrive
      ? data?.parent?.name || "My Drive"
      : scope === "starred"
        ? "Starred"
        : scope === "recent"
          ? "Recent"
          : scope === "shared-with-me"
            ? "Shared with me"
            : scope === "trash"
              ? "Recycle bin"
              : "Search");
  const pageDescription =
    description ||
    (isDrive
      ? data?.parent
        ? `${data.breadcrumbs.map((crumb) => crumb.name).join(" / ") || data.parent.name}`
        : "Files and folders stored on your private cloud."
      : scope === "starred"
        ? "Files and folders you marked for quick access."
        : scope === "recent"
          ? "Your most recently updated files and folders, newest first."
          : scope === "shared-with-me"
            ? "Items other people on this server have shared with you."
            : scope === "trash"
              ? `Deleted items are kept for ${me.settings.trashRetentionDays} days before being removed permanently.`
              : query
                ? `Results for “${query}”`
                : "Search across every file and folder you can access.");

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div
      className="relative min-h-[60vh]"
      onDragEnter={(event) => {
        if (!canUpload) return;
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!canUpload) return;
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!canUpload) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      <PageHeader
        title={heading}
        description={pageDescription}
        breadcrumbs={isDrive ? data?.breadcrumbs : undefined}
        actions={
          <>
            {isDrive && data?.parent ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={data.breadcrumbs.length > 1 ? `/drive/folders/${data.breadcrumbs[data.breadcrumbs.length - 2].id}` : "/drive"}>
                  <ChevronLeft className="h-4 w-4" /> Back
                </Link>
              </Button>
            ) : null}
            {canCreateFolder ? (
              <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus className="h-4 w-4" /> New folder
              </Button>
            ) : null}
            {canUpload ? (
              <UploadButton parentId={folderId} size="sm" label="Upload" />
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setRefreshToken((value) => value + 1)}
              aria-label="Refresh listing"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-sm">
          <Button
            type="button"
            size="icon-sm"
            variant={view === "grid" ? "secondary" : "ghost"}
            onClick={() => setView("grid")}
            aria-label="Grid view"
            aria-pressed={view === "grid"}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => setView("list")}
            aria-label="List view"
            aria-pressed={view === "list"}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowDownUp className="h-3.5 w-3.5" />
          <Select
            value={sortValue}
            onChange={(event) => setSortValue(event.target.value as SortValue)}
            className="h-8 w-auto min-w-[9.5rem] text-xs"
            aria-label="Sort items"
          >
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="size-desc">Largest first</option>
            <option value="type-asc">File type</option>
          </Select>
        </div>

        <Select
          value={category}
          onChange={(event) => setCategory(event.target.value as FileCategory | "all")}
          className="h-8 w-auto min-w-[8.5rem] text-xs"
          aria-label="Filter by file type"
        >
          <option value="all">All types</option>
          <option value="image">Photos</option>
          <option value="video">Videos</option>
          <option value="audio">Audio</option>
          <option value="document">Documents</option>
          <option value="archive">Archives</option>
          <option value="other">Other</option>
        </Select>

        {isTrash ? (
          <form
            className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setRefreshToken((value) => value + 1);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={trashQuery}
              onChange={(event) => {
                setTrashQuery(event.target.value);
                if (!event.target.value) setRefreshToken((value) => value + 1);
              }}
              placeholder="Search trash"
              className="h-8 pl-9 text-xs"
              aria-label="Search recycle bin"
            />
          </form>
        ) : (
          <p className="ml-auto text-xs text-muted-foreground">
            {data ? `${data.total} item${data.total === 1 ? "" : "s"}` : loading ? "Loading…" : ""}
          </p>
        )}
      </div>

      {selected.size > 0 ? (
        <div className="sticky top-[68px] z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.045] px-3 py-2 shadow-sm backdrop-blur-md">
          <span className="mr-1 text-sm font-medium">{selected.size} selected</span>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4" /> Clear
          </Button>
          <Separator orientation="vertical" className="h-5" />
          {!isTrash ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void runBatch("star", selectedItems())
                    .then((response) => {
                      reportBatch("star", response);
                      notifyChanged();
                    })
                    .catch((err) => toast.error(errorMessage(err)))
                }
              >
                <Star className="h-4 w-4" /> Star
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void runBatch("unstar", selectedItems())
                    .then((response) => {
                      reportBatch("unstar", response);
                      notifyChanged();
                    })
                    .catch((err) => toast.error(errorMessage(err)))
                }
              >
                <StarOff className="h-4 w-4" /> Unstar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTransfer({ mode: "move", items: selectedItems() })}
              >
                <FolderOpen className="h-4 w-4" /> Move
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTransfer({ mode: "copy", items: selectedItems() })}
              >
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadSelected}>
                <Download className="h-4 w-4" /> Download
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => confirmTrash(selectedItems())}
              >
                <Trash2 className="h-4 w-4" /> Trash
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void executeBatch("restore", selectedItems()).catch(() => undefined)}
              >
                <RotateCcw className="h-4 w-4" /> Restore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => confirmPermanent(selectedItems())}
              >
                <Trash2 className="h-4 w-4" /> Delete forever
              </Button>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-10 text-center">
          <FileQuestion className="mx-auto mb-3 h-8 w-8 text-destructive/70" />
          <p className="text-sm font-medium text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setRefreshToken((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      ) : loading && !data ? (
        view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-xl border border-border bg-card"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-lg border border-border bg-card"
              />
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState
          icon={
            scope === "trash"
              ? Trash2
              : scope === "starred"
                ? Star
                : scope === "shared-with-me"
                  ? FolderSearch
                  : scope === "search"
                    ? SearchX
                    : Folder
          }
          title={
            isTrash
              ? trashQuery
                ? "No matching items in the recycle bin"
                : "The recycle bin is empty"
              : scope === "starred"
                ? "No starred items yet"
                : scope === "shared-with-me"
                  ? "Nothing has been shared with you yet"
                  : scope === "search"
                    ? "No results found"
                    : scope === "recent"
                      ? "No recent files"
                      : "This folder is empty"
          }
          description={
            isTrash
              ? "Items you delete will appear here until their retention period expires."
              : scope === "starred"
                ? "Use the star action on any file or folder to pin it here."
                : scope === "shared-with-me"
                  ? "When another account shares a file or folder with you, it will show up here."
                  : scope === "search"
                    ? "Try a shorter term, a different spelling, or check the file type filter."
                    : canUpload
                      ? "Drop files anywhere on this page or use the Upload button to get started."
                      : "There are no items here yet."
          }
          action={
            canUpload ? (
              <>
                <UploadButton parentId={folderId} label="Upload files" />
                {canCreateFolder ? (
                  <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
                    <FolderPlus className="h-4 w-4" /> New folder
                  </Button>
                ) : null}
              </>
            ) : undefined
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => {
            const selectedItem = selected.has(itemKey(item));
            return (
              <div
                key={itemKey(item)}
                role="button"
                tabIndex={0}
                onClick={() => openItem(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openItem(item);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu({ x: event.clientX, y: event.clientY, item });
                }}
                className={cn(
                  "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-float focus-visible:ring-2 focus-visible:ring-ring",
                  selectedItem && "border-primary/50 ring-2 ring-primary/20"
                )}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-muted to-secondary/60">
                  {item.type === "folder" ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-500 shadow-inner dark:text-amber-300">
                        <Folder className="h-8 w-8" />
                      </span>
                    </div>
                  ) : (
                    <FileThumbnail file={item} />
                  )}

                  <span
                    className={cn(
                      "absolute left-2 top-2 transition-opacity",
                      selectedItem ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                    )}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedItem}
                      onCheckedChange={() => toggleSelect(item)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select ${item.name}`}
                      className="border-white/70 bg-white/85 shadow"
                    />
                  </span>

                  <div
                    className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {item.isStarred ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-background/85 text-amber-500 shadow-sm backdrop-blur">
                        <Star className="h-3.5 w-3.5 fill-current" />
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
                      aria-label={`Actions for ${item.name}`}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setContextMenu({
                          x: rect.right - 8,
                          y: rect.bottom + 4,
                          item,
                        });
                      }}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
                  <p className="truncate text-sm font-medium" title={item.name}>
                    {item.name}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.type === "folder"
                      ? "Folder"
                      : formatBytesClient(item.size)}
                    {" · "}
                    {formatRelative(item.updatedAt)}
                  </p>
                  {!item.isOwner && item.ownerName ? (
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      Shared by {item.ownerName}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="w-4">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all items"
              />
            </span>
            <span className="flex-1">Name</span>
            <span className="hidden w-24 shrink-0 sm:block">Owner</span>
            <span className="w-20 shrink-0 text-right">Size</span>
            <span className="hidden w-36 shrink-0 text-right md:block">Modified</span>
            <span className="w-8 shrink-0" />
          </div>
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const selectedItem = selected.has(itemKey(item));
              return (
                <li
                  key={itemKey(item)}
                  role="button"
                  tabIndex={0}
                  onClick={() => openItem(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openItem(item);
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ x: event.clientX, y: event.clientY, item });
                  }}
                  className={cn(
                    "group flex cursor-pointer items-center gap-3 px-3 py-2 text-sm outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/60",
                    selectedItem && "bg-primary/[0.04]"
                  )}
                >
                  <span className="w-4" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={selectedItem}
                      onCheckedChange={() => toggleSelect(item)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select ${item.name}`}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
                      {itemIcon(item, "h-4 w-4")}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{item.name}</span>
                        {item.isStarred ? (
                          <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                        ) : null}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground sm:hidden">
                        {item.type === "folder" ? "Folder" : formatBytesClient(item.size)} ·{" "}
                        {formatRelative(item.updatedAt)}
                      </span>
                    </span>
                  </span>
                  <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground sm:block">
                    {item.isOwner ? "Me" : item.ownerName || "—"}
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {item.type === "folder" ? "—" : formatBytesClient(item.size)}
                  </span>
                  <span
                    className="hidden w-36 shrink-0 text-right text-xs text-muted-foreground md:block"
                    title={formatDate(item.updatedAt)}
                  >
                    {formatRelative(item.updatedAt)}
                  </span>
                  <span className="w-8 shrink-0" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-colors hover:bg-accent hover:text-foreground group-hover:opacity-100"
                      aria-label={`Actions for ${item.name}`}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setContextMenu({ x: rect.right - 8, y: rect.bottom + 4, item });
                      }}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {items.length > 0 && view === "list" ? (
        <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>
            {data ? `${data.total} item${data.total === 1 ? "" : "s"}` : ""}
          </span>
          <span>
            {allSelected ? "All on this page selected" : someSelected ? `${selected.size} selected` : ""}
          </span>
        </div>
      ) : null}

      {pageCount > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="min-w-[90px] text-center text-xs text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount || loading}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {dragActive && canUpload ? (
        <div
          className="pointer-events-none fixed inset-4 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UploadCloud className="h-8 w-8" />
            </span>
            <p className="text-lg font-semibold">Drop files to upload</p>
            <p className="text-sm text-muted-foreground">
              {folderId ? "They will be added to this folder." : "They will be added to My Drive."}
            </p>
          </div>
        </div>
      ) : null}

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        parentId={folderId}
      />

      <RenameDialog
        item={renameTarget}
        open={Boolean(renameTarget)}
        onOpenChange={(value) => {
          if (!value) setRenameTarget(null);
        }}
      />

      <MoveDialog
        open={Boolean(transfer)}
        onOpenChange={(value) => {
          if (!value) setTransfer(null);
        }}
        title={transfer?.mode === "copy" ? "Copy to folder" : "Move to folder"}
        description={
          transfer
            ? `${transfer.mode === "copy" ? "Copy" : "Move"} ${
                transfer.items.length === 1
                  ? `“${transfer.items[0].name}”`
                  : `${transfer.items.length} items`
              } to another folder in your drive.`
            : ""
        }
        excludeId={
          transfer?.items.length === 1 && transfer.items[0].type === "folder"
            ? transfer.items[0].id
            : undefined
        }
        onConfirm={onTransferConfirm}
      />

      <ShareDialog
        item={shareTarget}
        open={Boolean(shareTarget)}
        onOpenChange={(value) => {
          if (!value) setShareTarget(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmState)}
        onOpenChange={(value) => {
          if (!value) setConfirmState(null);
        }}
        title={confirmState?.title || ""}
        description={confirmState?.description || ""}
        confirmLabel={confirmState?.confirmLabel || "Confirm"}
        destructive={confirmState?.destructive}
        loading={confirmLoading}
        onConfirm={onConfirmAction}
      />

      <FilePreviewDialog
        file={previewFile}
        open={Boolean(previewFile)}
        onOpenChange={(value) => {
          if (!value) setPreviewId(null);
        }}
        onPrevious={previewFiles.length > 1 ? showPreviousPreview : undefined}
        onNext={previewFiles.length > 1 ? showNextPreview : undefined}
        position={
          previewFiles.length > 1 && previewIndex >= 0
            ? `${previewIndex + 1} / ${previewFiles.length}`
            : undefined
        }
      />

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.item.name}
          actions={contextActions(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
