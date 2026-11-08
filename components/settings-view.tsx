"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import {
  AlertCircle,
  CheckCircle2,
  HardDrive,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  Monitor,
  Save,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/item-dialogs";
import { useUser } from "@/components/user-context";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/api-client";
import { formatBytesClient, formatDate, formatRelative } from "@/lib/format";
import type { SessionDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function describeClient(userAgent: string): { label: string; icon: React.ComponentType<{ className?: string }> } {
  const ua = userAgent.toLowerCase();
  const browser = /edg\//.test(ua)
    ? "Edge"
    : /chrome\//.test(ua) && !/opr\//.test(ua)
      ? "Chrome"
      : /firefox\//.test(ua)
        ? "Firefox"
        : /safari\//.test(ua)
          ? "Safari"
          : "Browser";
  if (/iphone|ipad|ipod/.test(ua)) return { label: `${browser} on iPhone/iPad`, icon: Smartphone };
  if (/android/.test(ua)) return { label: `${browser} on Android`, icon: Smartphone };
  if (/windows/.test(ua)) return { label: `${browser} on Windows`, icon: Monitor };
  if (/mac os|macintosh/.test(ua)) return { label: `${browser} on macOS`, icon: Laptop };
  if (/linux/.test(ua)) return { label: `${browser} on Linux`, icon: Laptop };
  return { label: userAgent.slice(0, 60) || "Unknown client", icon: Monitor };
}

export function SettingsView() {
  const { me, refreshMe } = useUser();
  const [name, setName] = React.useState(me.user.name);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [changingPassword, setChangingPassword] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordDone, setPasswordDone] = React.useState(false);

  const [sessions, setSessions] = React.useState<SessionDTO[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(true);
  const [sessionsError, setSessionsError] = React.useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<SessionDTO | null>(null);
  const [revoking, setRevoking] = React.useState(false);
  const [revokeOthersOpen, setRevokeOthersOpen] = React.useState(false);

  const loadSessions = React.useCallback(async () => {
    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const response = await apiGet<{ sessions: SessionDTO[] }>("/api/me/sessions");
      setSessions(response.sessions);
    } catch (err) {
      setSessionsError(errorMessage(err));
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions, me.user.name]);

  const passwordChecks = [
    { label: "At least 12 characters", ok: newPassword.length >= 12 },
    { label: "Upper and lowercase letters", ok: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) },
    { label: "At least one number", ok: /[0-9]/.test(newPassword) },
    { label: "At least one symbol", ok: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || name.trim() === me.user.name) return;
    setSavingProfile(true);
    setProfileError(null);
    try {
      await apiPatch("/api/me", { name: name.trim() });
      await refreshMe();
      toast.success("Profile updated");
    } catch (err) {
      setProfileError(errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    if (!passwordChecks.every((check) => check.ok)) {
      setPasswordError("The new password does not meet all requirements.");
      return;
    }
    setChangingPassword(true);
    try {
      await apiPost("/api/me/password", { currentPassword, newPassword });
      setPasswordDone(true);
      toast.success("Password changed. Signing out…");
      window.setTimeout(() => {
        void signOut({ callbackUrl: "/login?changed=1" });
      }, 1500);
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setChangingPassword(false);
    }
  }

  async function revokeSession() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await apiDelete(`/api/me/sessions/${revokeTarget.id}`);
      toast.success("Session revoked");
      setRevokeTarget(null);
      await loadSessions();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRevoking(false);
    }
  }

  async function revokeOthers() {
    setRevoking(true);
    try {
      await apiDelete("/api/me/sessions");
      toast.success("All other sessions were signed out");
      setRevokeOthersOpen(false);
      await loadSessions();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRevoking(false);
    }
  }

  const percent = me.quota.quotaBytes
    ? Math.min(100, me.quota.percent)
    : Math.min(100, (me.quota.usedBytes / (me.quota.totalDiskBytes || 1)) * 100);
  const otherSessions = sessions.filter((session) => !session.current).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Account settings"
        description="Manage your profile, password and signed-in devices."
        icon={<UserRound className="h-5 w-5" />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your display name is visible to people you share files with.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={saveProfile} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="profile-name">Display name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoComplete="name"
                disabled={savingProfile}
              />
            </div>
            <Button
              type="submit"
              loading={savingProfile}
              disabled={!name.trim() || name.trim() === me.user.name}
            >
              <Save className="h-4 w-4" /> Save name
            </Button>
          </form>
          {profileError ? <p className="text-sm text-destructive">{profileError}</p> : null}

          <Separator />

          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Email address
              </dt>
              <dd className="mt-1 truncate">{me.user.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Role
              </dt>
              <dd className="mt-1">
                <Badge variant={me.user.role === "admin" ? "default" : "secondary"}>
                  {me.user.role === "admin" ? "Administrator" : "User"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Member since
              </dt>
              <dd className="mt-1">{formatDate(me.user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Application
              </dt>
              <dd className="mt-1">{me.appName}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" /> Storage
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {me.quota.quotaBytes > 0
                ? "Your personal quota on this server."
                : "No personal quota is set; the storage disk is the limit."}
            </p>
          </div>
          <Badge
            variant={
              me.quota.warning === "full"
                ? "destructive"
                : me.quota.warning === "near"
                  ? "warning"
                  : "success"
            }
          >
            {me.quota.warning === "full"
              ? "Full"
              : me.quota.warning === "near"
                ? "Almost full"
                : "Healthy"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-end justify-between">
            <p className="text-2xl font-semibold tabular-nums">
              {formatBytesClient(me.quota.usedBytes)}
            </p>
            <p className="text-sm text-muted-foreground">
              {me.quota.quotaBytes > 0 ? `of ${formatBytesClient(me.quota.quotaBytes)}` : "unlimited"}
            </p>
          </div>
          <Progress
            value={percent}
            indicatorClassName={
              percent >= 95 ? "bg-destructive" : percent >= 85 ? "bg-amber-500" : undefined
            }
          />
          <p className="text-xs text-muted-foreground">
            {me.quota.quotaBytes > 0
              ? `${formatBytesClient(Math.max(0, me.quota.quotaBytes - me.quota.usedBytes))} available`
              : `${formatBytesClient(me.quota.freeDiskBytes)} free on the storage disk`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> Password
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Changing your password signs out every device, including this one.
          </p>
        </CardHeader>
        <CardContent>
          {passwordDone ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              Password changed. Redirecting to sign in…
            </div>
          ) : (
            <form onSubmit={changePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-current-password">Current password</Label>
                <Input
                  id="settings-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  disabled={changingPassword}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="settings-new-password">New password</Label>
                  <Input
                    id="settings-new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    disabled={changingPassword}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-confirm-password">Confirm new password</Label>
                  <Input
                    id="settings-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    disabled={changingPassword}
                  />
                </div>
              </div>

              <ul className="grid gap-1.5 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-2">
                {passwordChecks.map((check) => (
                  <li
                    key={check.label}
                    className={
                      check.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    }
                  >
                    {check.ok ? "✓" : "○"} {check.label}
                  </li>
                ))}
              </ul>

              {passwordError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {passwordError}
                </div>
              ) : null}

              <Button
                type="submit"
                loading={changingPassword}
                disabled={
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  !passwordChecks.every((check) => check.ok)
                }
              >
                Update password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Signed-in devices
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Revoke any session you do not recognize. Sessions expire automatically.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={otherSessions === 0 || loadingSessions}
            onClick={() => setRevokeOthersOpen(true)}
          >
            <LogOut className="h-4 w-4" /> Sign out other devices
          </Button>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading sessions…
            </div>
          ) : sessionsError ? (
            <div className="flex items-center gap-3 text-sm text-destructive">
              {sessionsError}
              <Button variant="outline" size="sm" onClick={() => void loadSessions()}>
                Retry
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {sessions.map((session) => {
                const client = describeClient(session.userAgent);
                return (
                  <li key={session.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <client.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {client.label}
                        {session.current ? (
                          <Badge variant="success" className="shrink-0">
                            This device
                          </Badge>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Last active {formatRelative(session.lastSeenAt)} · signed in{" "}
                        {formatDate(session.createdAt)}
                      </p>
                    </div>
                    {!session.current ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setRevokeTarget(session)}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(value) => {
          if (!value) setRevokeTarget(null);
        }}
        title="Revoke this session?"
        description="That device will need to sign in again. The current session is not affected."
        confirmLabel="Revoke session"
        destructive
        loading={revoking}
        onConfirm={revokeSession}
      />

      <ConfirmDialog
        open={revokeOthersOpen}
        onOpenChange={setRevokeOthersOpen}
        title="Sign out other devices?"
        description={`${otherSessions} other session${otherSessions === 1 ? "" : "s"} will be revoked. This device stays signed in.`}
        confirmLabel="Sign out others"
        destructive
        loading={revoking}
        onConfirm={revokeOthers}
      />
    </div>
  );
}
