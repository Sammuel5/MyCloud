"use client";

import * as React from "react";
import { ChevronRight, Folder, FolderOpen, HardDrive, Loader2, Search } from "lucide-react";
import { apiGet, errorMessage } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FolderEntry {
  id: string;
  name: string;
  parentId: string | null;
  role: string;
}

interface Node extends FolderEntry {
  children: Node[];
  depth: number;
}

function buildTree(folders: FolderEntry[]): Node[] {
  const map = new Map<string, Node>();
  for (const folder of folders) map.set(folder.id, { ...folder, children: [], depth: 0 });
  const roots: Node[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const setDepth = (nodes: Node[], depth: number) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      node.depth = depth;
      setDepth(node.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

function flatten(nodes: Node[], filter: string): Node[] {
  const output: Node[] = [];
  const needle = filter.trim().toLowerCase();
  const walk = (items: Node[]) => {
    for (const item of items) {
      const matches = !needle || item.name.toLowerCase().includes(needle);
      if (matches) output.push(item);
      if (!needle) walk(item.children);
      else if (item.children.length) walk(item.children);
    }
  };
  walk(nodes);
  return output;
}

export function FolderPicker({
  value,
  onChange,
  excludeId,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  excludeId?: string;
}) {
  const [folders, setFolders] = React.useState<FolderEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    const query = excludeId ? `?exclude=${encodeURIComponent(excludeId)}` : "";
    apiGet<{ folders: FolderEntry[] }>(`/api/folders/tree${query}`)
      .then((response) => {
        if (!cancelled) setFolders(response.folders);
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
  }, [excludeId]);

  const entries = React.useMemo(
    () => flatten(buildTree(folders), filter),
    [folders, filter]
  );

  if (loading) {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading folders…
      </div>
    );
  }
  if (error) {
    return <p className="py-4 text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter folders"
          className="pl-9"
          aria-label="Filter folders"
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/20 p-1 scrollbar-thin">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
            value === null && "bg-primary/10 font-medium text-primary"
          )}
        >
          <HardDrive className="h-4 w-4" />
          My Drive (root)
        </button>
        {entries.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => onChange(node.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
              value === node.id && "bg-primary/10 font-medium text-primary"
            )}
            style={{ paddingLeft: `${node.depth * 16 + 12}px` }}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {value === node.id ? (
                <FolderOpen className="h-4 w-4" />
              ) : (
                <Folder className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <span className="truncate">{node.name}</span>
            {node.role !== "owner" ? (
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                {node.role}
              </span>
            ) : null}
          </button>
        ))}
        {entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {filter ? "No folders match that filter." : "No subfolders yet."}
          </p>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Choose “My Drive (root)” to move items to the top level.
      </p>
    </div>
  );
}
