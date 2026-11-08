"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, Cloud, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet } from "@/lib/api-client";
import type { MeResponse } from "@/lib/types";

export function LoginForm({
  appName,
  callbackUrl,
  passwordChanged,
}: {
  appName: string;
  callbackUrl: string;
  passwordChanged: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (!result || result.error) {
        setError("Those credentials did not work. Check your email and password.");
        return;
      }
      const me = await apiGet<MeResponse>("/api/me");
      router.replace(me.user.mustChangePassword ? "/change-password" : callbackUrl);
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Check that the server is running and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-sidebar text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-grid opacity-[0.13]" />
        <div className="absolute -left-28 top-1/3 h-80 w-80 rounded-full bg-sky-500/25 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="relative z-10 p-12">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 shadow-lg">
              <Cloud className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">{appName}</span>
          </div>
          <div className="mt-24 max-w-md">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
              Your files. Your hardware.
            </p>
            <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight">
              A private cloud that belongs to you.
            </h1>
            <p className="mt-5 text-[15px] leading-7 text-slate-300">
              Original-quality photos, videos and documents stored on your own computer —
              reachable from every device on your private tailnet.
            </p>
            <ul className="mt-9 space-y-3 text-sm text-slate-300">
              <li className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 text-sky-300" /> Account-based access with no public signup
              </li>
              <li className="flex items-center gap-3">
                <LockKeyhole className="h-4 w-4 text-sky-300" /> Local-only storage and MongoDB
              </li>
              <li className="flex items-center gap-3">
                <Cloud className="h-4 w-4 text-sky-300" /> Resumable uploads, galleries and sharing
              </li>
            </ul>
          </div>
        </div>
        <div className="relative z-10 border-t border-white/10 p-8 text-xs text-slate-400">
          Self-hosted · Tailscale-ready · No third-party file storage
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-white shadow-lg">
              <Cloud className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">{appName}</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in with the account your administrator created.
          </p>

          {passwordChanged ? (
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Password updated. Sign in again with your new password.
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
            Need an account? Ask the MyCloud administrator to create one for you.
            <br />
            Public signup is intentionally disabled.
          </p>
        </div>
      </section>
    </main>
  );
}
