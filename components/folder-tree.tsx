"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Folder, FolderOpen, Loader2 } from "lucide-react";
import { apiGet, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface TreeFolder {
  id: string;
  name: string;
  parentId: string | null;
  role: string;
}

interface FolderNode extends TreeFolder {
  children: FolderNode[];
}

function buildTree(folders: TreeFolder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const folder of folders) nodes.set(folder.id, { ...folder, children: [] });
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (items: FolderNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) sortNodes(item.children);
  };
  sortNodes(roots);
  return roots;
}

function Node({
  node,
  depth,
  expanded,
  toggle,
}: {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded text-sidebar-muted hover:bg-white/10 hover:text-white",
            !hasChildren && "invisible"
          )}
          onClick={() => toggle(node.id)}
          aria-label={isOpen ? "Collapse folder" : "Expand folder"}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
        </button>
        <Link
          href={`/drive/folders/${node.id}`}
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground/75 transition-colors hover:bg-white/10 hover:text-white"
          style={{ paddingLeft: `${Math.max(4, depth * 10 + 4)}px` }}
        >
          {isOpen ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-sidebar-accent" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />
          )}
          <span className="truncate">{node.name}</span>
        </Link>
      </div>
      {hasChildren && isOpen ? (
        <ul>
          {node.children.map((child) => (
            <Node
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FolderTree() {
  const [folders, setFolders] = React.useState<TreeFolder[]>([]);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const response = await apiGet<{ folders: TreeFolder[] }>("/api/folders/tree");
      setFolders(response.folders);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (!cancelled) void load(true);
    };
    void load();
    window.addEventListener("mycloud:changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("mycloud:changed", refresh);
    };
  }, [load]);

  const tree = React.useMemo(() => buildTree(folders), [folders]);
  const toggle = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-sidebar-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading folders…
      </div>
    );
  }
  if (error) {
    return <p className="px-3 py-2 text-xs text-sidebar-muted">{error}</p>;
  }
  if (tree.length === 0) {
    return <p className="px-3 py-2 text-xs text-sidebar-muted">No folders yet</p>;
  }

  return (
    <nav aria-label="Folder tree" className="max-h-64 overflow-y-auto scrollbar-thin">
      <ul className="space-y-0.5">
        {tree.map((node) => (
          <Node key={node.id} node={node} depth={0} expanded={expanded} toggle={toggle} />
        ))}
      </ul>
    </nav>
  );
}
