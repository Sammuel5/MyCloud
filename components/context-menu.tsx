"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ContextMenuAction {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export function ContextMenu({
  x,
  y,
  title,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  title?: string;
  actions: ContextMenuAction[];
  onClose: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<{ left: number; top: number } | null>(null);

  React.useLayoutEffect(() => {
    const width = 224;
    const estimatedHeight = actions.length * 38 + 24;
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - estimatedHeight - 8));
    setPosition({ left, top });
  }, [x, y, actions.length]);

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [onClose]);

  if (typeof document === "undefined" || !position) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Item actions"
      className="fixed z-[80] w-56 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-float animate-scale-in"
      style={{ left: position.left, top: position.top }}
    >
      {title ? (
        <p className="truncate border-b border-border px-2.5 py-2 text-xs font-medium text-muted-foreground">
          {title}
        </p>
      ) : null}
      {actions.map((action, index) => (
        <React.Fragment key={`${action.label}-${index}`}>
          {action.separatorBefore ? <div className="my-1 h-px bg-border" /> : null}
          <button
            type="button"
            role="menuitem"
            disabled={action.disabled}
            onClick={() => {
              onClose();
              action.onSelect();
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-45",
              action.destructive
                ? "text-destructive hover:bg-destructive/10"
                : "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {action.icon ? <action.icon className="h-4 w-4 shrink-0" /> : null}
            <span className="truncate">{action.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
}
