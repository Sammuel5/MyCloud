import * as React from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbEntry {
  id: string;
  name: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: BreadcrumbEntry[];
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 space-y-3", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link
            href="/drive"
            className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
          >
            <Home className="h-3.5 w-3.5" />
            My Drive
          </Link>
          {breadcrumbs.map((crumb, index) => {
            const last = index === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.id}>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                {last ? (
                  <span className="max-w-[240px] truncate px-1 py-0.5 font-medium text-foreground">
                    {crumb.name}
                  </span>
                ) : (
                  <Link
                    href={`/drive/folders/${crumb.id}`}
                    className="max-w-[200px] truncate rounded px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {crumb.name}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight">
            {icon ? <span className="text-muted-foreground">{icon}</span> : null}
            <span className="truncate">{title}</span>
          </h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
