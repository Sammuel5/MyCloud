"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  ChevronDown,
  Clock,
  Cloud,
  FolderHeart,
  Gauge,
  HardDrive,
  Image,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  Star,
  Trash2,
  UserCog,
  Users,
  Video,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderTree } from "@/components/folder-tree";
import { ThemeToggle } from "@/components/theme-toggle";
import { UploadButton } from "@/components/upload-button";
import { useUser } from "@/components/user-context";
import { formatBytesClient } from "@/lib/format";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const primaryNav: NavItem[] = [
  { href: "/drive", label: "My Drive", icon: HardDrive },
  { href: "/recent", label: "Recent", icon: Clock },
  { href: "/starred", label: "Starred", icon: Star },
  { href: "/shared", label: "Shared", icon: FolderHeart },
  { href: "/photos", label: "Photos", icon: Image },
  { href: "/videos", label: "Videos", icon: Video },
  { href: "/trash", label: "Recycle bin", icon: Trash2 },
];

const adminNav: NavItem[] = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/settings", label: "System settings", icon: Settings },
  { href: "/admin/audit", label: "Audit log", icon: Shield },
  { href: "/admin/health", label: "Health & jobs", icon: Activity },
];

function navActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/drive") return pathname === "/drive" || pathname.startsWith("/drive/");
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function SidebarContent({ close }: { close?: () => void }) {
  const pathname = usePathname();
  const { me } = useUser();
  const quota = me.quota;
  const percent = quota.quotaBytes > 0 ? Math.min(100, quota.percent) : 0;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/30">
          <Cloud className="h-5 w-5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-tight">
            {me.appName}
          </p>
          <p className="text-[11px] text-sidebar-muted">Private cloud drive</p>
        </div>
        {close ? (
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1.5 text-sidebar-muted hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <div className="px-4 pb-3">
        <UploadButton
          parentId={null}
          label="Upload files"
          className="w-full justify-center bg-sidebar-accent text-white shadow-md hover:bg-sidebar-accent/90"
          size="lg"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
        <nav aria-label="Main navigation">
          <ul className="space-y-0.5">
            {primaryNav.map((item) => {
              const active = navActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-white/10 text-white shadow-sm"
                        : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-[17px] w-[17px]",
                        active ? "text-sidebar-accent" : "text-sidebar-muted group-hover:text-white"
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {active ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-sidebar-accent" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Separator className="my-4 bg-sidebar-border" />

        <div>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
            Folders
          </p>
          <FolderTree />
        </div>

        <Separator className="my-4 bg-sidebar-border" />

        <nav aria-label="Workspace">
          <ul className="space-y-0.5">
            <li>
              <Link
                href="/dashboard"
                onClick={close}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  navActive(pathname, { href: "/dashboard", label: "", icon: Gauge })
                    ? "bg-white/10 text-white"
                    : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <Gauge className="h-[17px] w-[17px] text-sidebar-muted" />
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                onClick={close}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  navActive(pathname, { href: "/settings", label: "", icon: Settings })
                    ? "bg-white/10 text-white"
                    : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <Settings className="h-[17px] w-[17px] text-sidebar-muted" />
                Account settings
              </Link>
            </li>
          </ul>
        </nav>

        {me.user.role === "admin" ? (
          <div className="mt-5">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              Administration
            </p>
            <ul className="space-y-0.5">
              {adminNav.map((item) => {
                const active = navActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={close}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-white/10 text-white"
                          : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <item.icon className="h-[17px] w-[17px] text-sidebar-muted" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-2 flex items-center justify-between text-[11px] text-sidebar-muted">
          <span className="flex items-center gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />
            {quota.quotaBytes > 0 ? "Storage quota" : "Storage used"}
          </span>
          <span>
            {quota.quotaBytes > 0
              ? `${percent.toFixed(percent < 10 ? 1 : 0)}%`
              : formatBytesClient(quota.usedBytes)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              percent >= 95 ? "bg-red-400" : percent >= 85 ? "bg-amber-400" : "bg-sky-400"
            )}
            style={{
              width:
                quota.quotaBytes > 0
                  ? `${Math.max(1, percent)}%`
                  : `${Math.min(100, Math.max(1, ((quota.usedBytes || 0) / (quota.totalDiskBytes || 1)) * 100))}%`,
            }}
          />
        </div>
        <p className="mt-2 text-[11px] text-sidebar-muted">
          {quota.quotaBytes > 0
            ? `${formatBytesClient(quota.usedBytes)} of ${formatBytesClient(quota.quotaBytes)}`
            : `${formatBytesClient(quota.freeDiskBytes)} free on storage disk`}
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const router = useRouter();
  const { me } = useUser();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [router]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    router.push(`/search?q=${encodeURIComponent(value)}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-[min(280px,86vw)] shadow-2xl">
            <SidebarContent close={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <form onSubmit={submitSearch} className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your drive…"
              aria-label="Search your drive"
              className="h-9 w-full rounded-lg border border-border/80 bg-muted/50 pl-9 pr-16 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/10"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
              Enter
            </kbd>
          </form>

          <div className="ml-auto flex items-center gap-1">
            <div className="hidden sm:block">
              <UploadButton parentId={null} label="Upload" size="sm" variant="subtle" />
            </div>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-1 flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-accent"
                  aria-label="Account menu"
                >
                  <Avatar name={me.user.name} className="h-8 w-8" />
                  <span className="hidden max-w-[120px] truncate text-sm font-medium sm:block">
                    {me.user.name}
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {me.user.name}
                  </span>
                  <span className="block truncate font-normal text-muted-foreground">
                    {me.user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <UserCog className="h-4 w-4" /> Account settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <Gauge className="h-4 w-4" /> Storage dashboard
                  </Link>
                </DropdownMenuItem>
                {me.user.role === "admin" ? (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/health">
                      <Activity className="h-4 w-4" /> System health
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  destructive
                  onSelect={() => {
                    void signOut({ callbackUrl: "/login" });
                  }}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
