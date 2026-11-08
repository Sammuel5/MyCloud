"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { AlertCircle, CheckCircle2, Cloud, KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, errorMessage } from "@/lib/api-client";

export function ChangePasswordForm({
  appName,
  mustChange,
}: {
  appName: string;
  mustChange: boolean;
}) {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const passwordChecks = [
    { label: "At least 12 characters", ok: newPassword.length >= 12 },
    { label: "Upper and lowercase letters", ok: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) },
    { label: "At least one number", ok: /[0-9]/.test(newPassword) },
    { label: "At least one symbol", ok: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (!passwordChecks.every((check) => check.ok)) {
      setError("The new password does not meet all requirements.");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/me/password", { currentPassword, newPassword });
      setDone(true);
      setTimeout(() => {
        void signOut({ callbackUrl: "/login?changed=1" });
      }, 1200);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-float sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-white shadow-lg">
            <Cloud className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">{appName}</p>
            <p className="text-xs text-muted-foreground">Account security</p>
          </div>
        </div>

        <div className="mt-7 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {mustChange ? "Set a new password" : "Change your password"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mustChange
                ? "Your temporary password must be replaced before you can continue."
                : "Choose a strong, unique password for this account."}
            </p>
          </div>
        </div>

        {done ? (
          <div className="mt-7 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Password changed. All sessions were signed out. Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={loading}
              />
            </div>

            <ul className="grid grid-cols-1 gap-1.5 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-2">
              {passwordChecks.map((check) => (
                <li
                  key={check.label}
                  className={check.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}
                >
                  {check.ok ? "✓" : "○"} {check.label}
                </li>
              ))}
            </ul>

            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" loading={loading}>
              Update password
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => void signOut({ callbackUrl: "/login" })}
              disabled={loading}
            >
              <LogOut className="h-4 w-4" /> Sign out instead
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
