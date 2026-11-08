"use client";

import * as React from "react";
import { AlertTriangle, FolderPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderPicker } from "@/components/folder-picker";
import { apiPost, apiPatch, errorMessage } from "@/lib/api-client";
import type { FolderItemDTO, ItemDTO } from "@/lib/types";
import { toast } from "sonner";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            {destructive ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
            ) : null}
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="text-sm leading-6 text-muted-foreground">{description}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => void onConfirm()}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewFolderDialog({
  open,
  onOpenChange,
  parentId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string | null;
  onCreated?: (folder: FolderItemDTO) => void;
}) {
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiPost<{ folder: FolderItemDTO }>("/api/folders", {
        name: name.trim(),
        parentId,
      });
      toast.success("Folder created");
      onOpenChange(false);
      onCreated?.(response.folder);
      window.dispatchEvent(new CustomEvent("mycloud:changed", { detail: { parentId } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-primary" /> New folder
          </DialogTitle>
          <DialogDescription>Give the folder a clear, descriptive name.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-folder-name">Folder name</Label>
            <Input
              id="new-folder-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              placeholder="e.g. Tax documents 2026"
              disabled={loading}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading} disabled={!name.trim()}>
              Create folder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameDialog({
  item,
  open,
  onOpenChange,
  onRenamed,
}: {
  item: ItemDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed?: () => void;
}) {
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && item) {
      setName(item.name);
      setError(null);
    }
  }, [open, item]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!item || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await apiPatch(`/api/items/${item.type}/${item.id}`, { name: name.trim() });
      toast.success("Renamed");
      onOpenChange(false);
      onRenamed?.();
      window.dispatchEvent(new CustomEvent("mycloud:changed"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename {item?.type === "folder" ? "folder" : "file"}</DialogTitle>
          <DialogDescription>
            {item?.type === "file"
              ? "The file extension cannot be changed after upload."
              : "People with access will see the new name."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rename-item">Name</Label>
            <Input
              id="rename-item"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              onFocus={(event) => {
                const dot = item?.type === "file" ? event.currentTarget.value.lastIndexOf(".") : -1;
                const end = dot > 0 ? dot : event.currentTarget.value.length;
                event.currentTarget.setSelectionRange(0, end);
              }}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} disabled={!name.trim()}>
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MoveDialog({
  open,
  onOpenChange,
  title,
  description,
  initialDestination = null,
  excludeId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initialDestination?: string | null;
  excludeId?: string;
  onConfirm: (destination: string | null) => Promise<void>;
}) {
  const [destination, setDestination] = React.useState<string | null>(initialDestination);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDestination(initialDestination);
      setError(null);
    }
  }, [open, initialDestination]);

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm(destination);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FolderPicker value={destination} onChange={setDestination} excludeId={excludeId} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} loading={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Moving…
              </>
            ) : (
              "Move here"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
