"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  Archive,
  ArrowRight,
  Clock,
  Download,
  File,
  FileAudio,
  FileText,
  FolderHeart,
  Gauge,
  HardDrive,
  Image,
  Images,
  Loader2,
  RefreshCw,
  Share2,
  Trash2,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FilePreviewDialog } from "@/components/file-preview";
import { UploadButton } from "@/components/upload-button";
import { apiGet, errorMessage } from "@/lib/api-client";
import { formatBytesClient, formatRelative } from "@/lib/format";
import type { DashboardData, FileCategory, FileItemDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_META: Record<
  FileCategory,
  { label: string; icon: React.ComponentType<{ className?: string }>; bar: string; text: string; bg: string }
> = {
  image: {
    label: "Photos",
    icon: Image,
    bar: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/10",
  },
  video: {
    label: "Videos",
    icon: Video,
    bar: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10",
  },
  document: {
    label: "Documents",
    icon: FileText,
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  audio: {
    label: "Audio",
    icon: FileAudio,
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  archive: {
    label: "Archives",
    icon: Archive,
    bar: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/10",
  },
  other: {
    label: "Other",
    icon: File,
    bar: "bg-slate-500",
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/10",
  },
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/70 bg-card p-4 shadow-soft", className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function DashboardView() {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<FileItemDTO | null>(null);
  const [refreshToken, setRefreshToken] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<DashboardData>("/api/dashboard")
      .then((response) => {
        if (!cancelled) setData(response);
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
  }, [refreshToken]);

  React.useEffect(() => {
    const handler = () => setRefreshToken((value) => value + 1);
    window.addEventListener("mycloud:changed", handler);
    return () => window.removeEventListener("mycloud:changed", handler);
  }, []);

  const percent = data?.quota.quotaBytes
    ? Math.min(100, data.quota.percent)
    : data
      ? Math.min(100, (data.quota.usedBytes / (data.quota.totalDiskBytes || 1)) * 100)
      : 0;

  const activityMax = data
    ? Math.max(1, ...data.activity.map((entry) => entry.uploads))
    : 1;
  const totalCategoryBytes = data
    ? data.categories.reduce((sum, entry) => sum + entry.bytes, 0)
    : 0;

  if (error) {
    return (
      <div>
        <PageHeader title="Storage dashboard" />
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setRefreshToken((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div>
        <PageHeader title="Storage dashboard" description="Usage, activity and storage health at a glance." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage dashboard"
        description="Usage, activity and storage health at a glance."
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setRefreshToken((value) => value + 1)}
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <UploadButton parentId={null} size="sm" label="Upload" />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Storage used"
          value={formatBytesClient(data.quota.usedBytes)}
          sub={
            data.quota.quotaBytes > 0
              ? `of ${formatBytesClient(data.quota.quotaBytes)} quota`
              : `${formatBytesClient(data.disk.freeBytes)} free on disk`
          }
          icon={HardDrive}
        />
        <StatCard
          label="Files"
          value={data.counts.files.toLocaleString()}
          sub={`${data.counts.folders.toLocaleString()} folders`}
          icon={File}
        />
        <StatCard
          label="Photos"
          value={data.counts.photos.toLocaleString()}
          sub={`${data.counts.videos.toLocaleString()} videos`}
          icon={Images}
        />
        <StatCard
          label="Shared with me"
          value={data.counts.sharedWithMe.toLocaleString()}
          sub={`${data.counts.sharedByMe.toLocaleString()} shared by you`}
          icon={Users}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" /> Storage quota
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.quota.quotaBytes > 0
                  ? "Your account quota and current usage."
                  : "No per-account quota is set; usage is limited by free disk space."}
              </p>
            </div>
            <Badge
              variant={
                data.quota.warning === "full"
                  ? "destructive"
                  : data.quota.warning === "near"
                    ? "warning"
                    : "success"
              }
            >
              {data.quota.warning === "full"
                ? "Full"
                : data.quota.warning === "near"
                  ? "Almost full"
                  : "Healthy"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 flex items-end justify-between gap-3">
                <p className="text-3xl font-semibold tabular-nums">
                  {formatBytesClient(data.quota.usedBytes)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data.quota.quotaBytes > 0
                    ? `of ${formatBytesClient(data.quota.quotaBytes)}`
                    : "unlimited quota"}
                </p>
              </div>
              <Progress
                value={percent}
                indicatorClassName={
                  percent >= 95 ? "bg-destructive" : percent >= 85 ? "bg-amber-500" : undefined
                }
              />
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{percent.toFixed(1)}% used</span>
                <span>
                  {data.quota.quotaBytes > 0
                    ? `${formatBytesClient(Math.max(0, data.quota.quotaBytes - data.quota.usedBytes))} available`
                    : `${formatBytesClient(data.disk.freeBytes)} free on storage disk`}
                </span>
              </div>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Active files</p>
                <p className="mt-1 font-semibold">{formatBytesClient(data.appUsedBytes)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Recycle bin</p>
                <p className="mt-1 font-semibold">{formatBytesClient(data.trashBytes)}</p>
                <Link
                  href="/trash"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Manage <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Disk</p>
                <p className="mt-1 font-semibold">{formatBytesClient(data.disk.freeBytes)} free</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  of {formatBytesClient(data.disk.totalBytes)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Upload activity
            </CardTitle>
            <p className="text-sm text-muted-foreground">Files uploaded over the last 14 days.</p>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1.5">
              {data.activity.map((entry) => {
                const height = entry.uploads > 0 ? Math.max(6, (entry.uploads / activityMax) * 100) : 2;
                return (
                  <div
                    key={entry.date}
                    className="group relative flex h-full flex-1 flex-col justify-end"
                    title={`${entry.date}: ${entry.uploads} upload${entry.uploads === 1 ? "" : "s"} (${formatBytesClient(entry.bytes)})`}
                  >
                    <div
                      className={cn(
                        "w-full rounded-t transition-colors",
                        entry.uploads > 0
                          ? "bg-primary/70 group-hover:bg-primary"
                          : "bg-muted-foreground/15"
                      )}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{data.activity[0]?.date.slice(5)}</span>
              <span>{data.activity[data.activity.length - 1]?.date.slice(5)}</span>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Last 14 days
              </span>
              <span className="font-medium">
                {data.activity.reduce((sum, entry) => sum + entry.uploads, 0).toLocaleString()} files
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Storage by type</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatBytesClient(totalCategoryBytes)} across active files.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.categories.map((entry) => {
              const meta = CATEGORY_META[entry.category];
              const share = totalCategoryBytes > 0 ? (entry.bytes / totalCategoryBytes) * 100 : 0;
              return (
                <div key={entry.category}>
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", meta.bg, meta.text)}>
                      <meta.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 font-medium">{meta.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {entry.count.toLocaleString()} · {formatBytesClient(entry.bytes)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", meta.bar)}
                      style={{ width: `${Math.max(entry.bytes > 0 ? 1 : 0, share)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Recent uploads
            </CardTitle>
            <Link href="/recent" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentUploads.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No files yet.</p>
            ) : (
              <ul className="space-y-1">
                {data.recentUploads.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => setPreview(file)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{file.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {formatBytesClient(file.size)} · {formatRelative(file.createdAt)}
                        </span>
                      </span>
                      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>Largest files</CardTitle>
            <p className="text-sm text-muted-foreground">The biggest space consumers in your drive.</p>
          </CardHeader>
          <CardContent>
            {data.largestFiles.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No files yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.largestFiles.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => setPreview(file)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <File className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatBytesClient(file.size)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jump back in</CardTitle>
            <p className="text-sm text-muted-foreground">Quick shortcuts to the rest of your cloud.</p>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {[
              { href: "/photos", label: "Photo library", icon: Images, sub: `${data.counts.photos} photos` },
              { href: "/videos", label: "Video library", icon: Video, sub: `${data.counts.videos} videos` },
              { href: "/starred", label: "Starred items", icon: FolderHeart, sub: "Quick access" },
              { href: "/shared", label: "Sharing", icon: Share2, sub: `${data.counts.sharedByMe} outgoing` },
              { href: "/trash", label: "Recycle bin", icon: Trash2, sub: `${data.counts.trashItems} items` },
              { href: "/drive", label: "My Drive", icon: HardDrive, sub: "Browse everything" },
            ].map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-accent/50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <shortcut.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{shortcut.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{shortcut.sub}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <FilePreviewDialog
        file={preview}
        open={Boolean(preview)}
        onOpenChange={(value) => {
          if (!value) setPreview(null);
        }}
      />
    </div>
  );
}
