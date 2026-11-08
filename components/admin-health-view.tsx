"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Film,
  Folder,
  HardDrive,
  Link2,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiGet, errorMessage } from "@/lib/api-client";
import { formatBytesClient, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BinaryHealth {
  ok: boolean;
  version: string | null;
}

interface HealthResponse {
  status: "healthy" | "degraded";
  app: {
    name: string;
    version: string;
    node: string;
    platform: string;
    uptimeSeconds: number;
    memoryUsedBytes: number;
  };
  database: {
    ok: boolean;
    latencyMs: number | null;
    local: boolean;
    users: number;
    files: number;
    folders: number;
    activeSessions: number;
  };
  storage: {
    ok: boolean;
    writable: boolean;
    disk: { totalBytes: number; usedBytes: number; freeBytes: number };
    activeUploads: number;
  };
  media: {
    ffmpeg: BinaryHealth;
    ffprobe: BinaryHealth;
  };
  jobs: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
  sharing: {
    publicLinks: number;
    publicSharingEnabled: boolean;
  };
  warnings: string[];
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="flex items-center gap-2 text-sm">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        {label}
      </span>
      <span className={cn("text-right text-xs", ok ? "text-muted-foreground" : "text-destructive")}>
        {detail || (ok ? "Operational" : "Unavailable")}
      </span>
    </div>
  );
}

export function AdminHealthView() {
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiGet<HealthResponse>("/api/admin/health");
      setHealth(response);
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const diskPercent =
    health && health.storage.disk.totalBytes > 0
      ? Math.min(
          100,
          Math.round((health.storage.disk.usedBytes / health.storage.disk.totalBytes) * 100)
        )
      : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Health & jobs"
        description="Live status of the database, storage volume, media tools and background worker."
        icon={<Activity className="h-5 w-5" />}
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh health status"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        }
      />

      {loading && !health ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card py-20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking system health…
        </div>
      ) : error && !health ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-12 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-3 text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : health ? (
        <div className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Last refresh failed: {error}
            </div>
          ) : null}

          <Card
            className={cn(
              "overflow-hidden border",
              health.status === "healthy"
                ? "border-emerald-500/25"
                : "border-amber-500/30"
            )}
          >
            <CardContent className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center">
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                  health.status === "healthy"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}
              >
                {health.status === "healthy" ? (
                  <ShieldCheck className="h-6 w-6" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">
                  {health.status === "healthy"
                    ? "All systems operational"
                    : "Some services need attention"}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {updatedAt ? `Updated ${formatRelative(updatedAt)}` : "Checking…"} · refreshes
                  automatically every 30 seconds
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={health.status === "healthy" ? "success" : "warning"}>
                  {health.status}
                </Badge>
                <Badge variant="outline">v{health.app.version}</Badge>
              </div>
            </CardContent>
          </Card>

          {health.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" /> Warnings
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-800/90 dark:text-amber-200/90">
                {health.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-primary" /> Storage volume
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {formatBytesClient(health.storage.disk.usedBytes)} used
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytesClient(health.storage.disk.freeBytes)} free of{" "}
                      {formatBytesClient(health.storage.disk.totalBytes)}
                    </span>
                  </div>
                  <Progress
                    value={diskPercent}
                    indicatorClassName={cn(
                      diskPercent >= 90
                        ? "bg-destructive"
                        : diskPercent >= 75
                          ? "bg-amber-500"
                          : "bg-primary"
                    )}
                  />
                </div>
                <div>
                  <StatusRow
                    label="Write access"
                    ok={health.storage.ok && health.storage.writable}
                    detail={health.storage.writable ? "Read and write" : "Not writable"}
                  />
                  <StatusRow
                    label="Active uploads"
                    ok
                    detail={`${health.storage.activeUploads} in progress`}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" /> MongoDB
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={health.database.ok ? "success" : "destructive"}>
                    {health.database.ok ? "Connected" : "Unreachable"}
                  </Badge>
                  <Badge variant={health.database.local ? "success" : "warning"}>
                    {health.database.local ? "Localhost only" : "Non-local host"}
                  </Badge>
                  {health.database.latencyMs !== null ? (
                    <Badge variant="secondary">Ping {health.database.latencyMs} ms</Badge>
                  ) : null}
                </div>
                <div>
                  <StatusRow label="Files" ok detail={health.database.files.toLocaleString()} />
                  <StatusRow
                    label="Folders"
                    ok
                    detail={health.database.folders.toLocaleString()}
                  />
                  <StatusRow
                    label="Active users"
                    ok
                    detail={health.database.users.toLocaleString()}
                  />
                  <StatusRow
                    label="Active sessions"
                    ok
                    detail={health.database.activeSessions.toLocaleString()}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Film className="h-4 w-4 text-primary" /> Media tools
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatusRow
                  label="FFmpeg"
                  ok={health.media.ffmpeg.ok}
                  detail={health.media.ffmpeg.ok ? health.media.ffmpeg.version || "Available" : "Unavailable"}
                />
                <StatusRow
                  label="FFprobe"
                  ok={health.media.ffprobe.ok}
                  detail={health.media.ffprobe.ok ? health.media.ffprobe.version || "Available" : "Unavailable"}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Used only to generate local thumbnails and read video metadata. Files never leave
                  this server.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Background jobs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Queued", value: health.jobs.queued, icon: Clock3 },
                    { label: "Running", value: health.jobs.running, icon: Loader2 },
                    { label: "Completed", value: health.jobs.completed, icon: CheckCircle2 },
                    { label: "Failed", value: health.jobs.failed, icon: XCircle },
                  ].map((job) => (
                    <div
                      key={job.label}
                      className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5"
                    >
                      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <job.icon className="h-3.5 w-3.5" /> {job.label}
                      </p>
                      <p className="mt-1 text-xl font-semibold tabular-nums">
                        {job.value.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  The worker runs inside the app process or as a separate service. Thumbnails and
                  trash cleanup are retried automatically.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-primary" /> Application
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatusRow label="Node.js" ok detail={health.app.node} />
                <StatusRow label="Platform" ok detail={health.app.platform} />
                <StatusRow label="Uptime" ok detail={formatUptime(health.app.uptimeSeconds)} />
                <StatusRow
                  label="Process memory"
                  ok
                  detail={formatBytesClient(health.app.memoryUsedBytes)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" /> Sharing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">Public sharing</span>
                  <Badge
                    variant={health.sharing.publicSharingEnabled ? "warning" : "success"}
                  >
                    {health.sharing.publicSharingEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">Active public links</span>
                  <span className="text-sm font-medium">
                    {health.sharing.publicLinks.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">Recycle bin</span>
                  <span className="text-sm font-medium">Automatic retention</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" /> At a glance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Files", value: health.database.files, icon: Folder },
                  { label: "Folders", value: health.database.folders, icon: Folder },
                  { label: "Users", value: health.database.users, icon: Users },
                  { label: "Uploads", value: health.storage.activeUploads, icon: UploadCloud },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-3"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-muted-foreground">
                      <stat.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="text-lg font-semibold tabular-nums">
                        {stat.value.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
