"use client";

import * as React from "react";
import { ChevronDown, Filter, Loader2, RefreshCw, Search, Shield } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { apiGet, errorMessage } from "@/lib/api-client";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AuditActor {
  id: string | null;
  name: string | null;
  email: string;
}

interface AuditEntry {
  id: string;
  actor: AuditActor | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  severity: "info" | "warning" | "security";
  metadata: Record<string, unknown>;
  ipHash: string | null;
  userAgent: string | null;
  createdAt: string;
}

const SEVERITY_VARIANT: Record<AuditEntry["severity"], "secondary" | "warning" | "destructive"> = {
  info: "secondary",
  warning: "warning",
  security: "destructive",
};

export function AdminAuditView() {
  const [logs, setLogs] = React.useState<AuditEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [limit] = React.useState(50);
  const [actionInput, setActionInput] = React.useState("");
  const [action, setAction] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (action) params.set("action", action);
    if (severity) params.set("severity", severity);
    setLoading(true);
    setError(null);
    apiGet<{ logs: AuditEntry[]; total: number; page: number; limit: number }>(
      `/api/admin/audit?${params.toString()}`
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setLogs(response.logs);
        setTotal(response.total);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, limit, action, severity, refreshToken]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  function toggleExpanded(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Security-relevant events and administrative actions. Entries are append-only."
        icon={<Shield className="h-5 w-5" />}
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setRefreshToken((value) => value + 1)}
            aria-label="Refresh audit log"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
          <form
            className="relative flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setAction(actionInput.trim());
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={actionInput}
              onChange={(event) => {
                setActionInput(event.target.value);
                if (!event.target.value) {
                  setPage(1);
                  setAction("");
                }
              }}
              placeholder="Filter by action, e.g. auth.login or admin.user"
              className="pl-9"
              aria-label="Filter audit actions"
            />
          </form>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value);
                setPage(1);
              }}
              className="w-40"
              aria-label="Filter by severity"
            >
              <option value="">All severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="security">Security</option>
            </Select>
          </div>
        </div>

        {error ? (
          <div className="px-4 py-10 text-center text-sm text-destructive">
            {error}
            <Button
              variant="outline"
              size="sm"
              className="ml-3"
              onClick={() => setRefreshToken((value) => value + 1)}
            >
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading audit events…
          </div>
        ) : logs.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">No events match those filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign-ins, sharing changes and administrative actions appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((entry) => {
              const isExpanded = expanded.has(entry.id);
              const metadataText = JSON.stringify(entry.metadata);
              return (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                          {entry.action}
                        </code>
                        <Badge variant={SEVERITY_VARIANT[entry.severity]} className="capitalize">
                          {entry.severity}
                        </Badge>
                        <span
                          className="text-xs text-muted-foreground"
                          title={formatDate(entry.createdAt)}
                        >
                          {formatRelative(entry.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {entry.actor
                          ? `${entry.actor.name || entry.actor.email}${entry.actor.name ? ` · ${entry.actor.email}` : ""}`
                          : "System / unauthenticated"}
                        {entry.targetType
                          ? ` · ${entry.targetType}${entry.targetId ? ` ${entry.targetId}` : ""}`
                          : ""}
                      </p>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(entry.id)}
                          className="mt-1 flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          <ChevronDown
                            className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")}
                          />
                          Details
                        </button>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {entry.id.slice(-8)}
                    </span>
                  </div>
                  {isExpanded ? (
                    <div className="mt-2 space-y-1 rounded-lg bg-muted/40 p-2.5">
                      <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 scrollbar-thin">
                        {metadataText === "{}" ? "No metadata" : JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                      {entry.ipHash ? (
                        <p className="text-[10px] text-muted-foreground">
                          Hashed IP: <code>{entry.ipHash}</code>
                        </p>
                      ) : null}
                      {entry.userAgent ? (
                        <p className="break-all text-[10px] text-muted-foreground">
                          Agent: {entry.userAgent}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {total.toLocaleString()} event{total === 1 ? "" : "s"}
          </span>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span>
                Page {page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount || loading}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
