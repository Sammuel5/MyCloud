"use client";

import * as React from "react";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/item-dialogs";
import { useUser } from "@/components/user-context";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage, gbToQuotaBytes, quotaBytesToGb } from "@/lib/api-client";
import { formatBytesClient, formatDate, formatRelative, initials } from "@/lib/format";
import type { UserDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function generatePassword(): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = lower + upper + digits + symbols;
  const length = 20;
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  const chars = Array.from(values, (value) => all[value % all.length]);
  const required = [lower, upper, digits, symbols].map((set, index) => {
    const extra = new Uint32Array(1);
    crypto.getRandomValues(extra);
    chars[index] = set[extra[0] % set.length];
  });
  void required;
  return chars.join("");
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

interface UserFormResult {
  email: string;
  password: string;
}

function UserFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: UserDTO | null;
  onSaved: () => void;
}) {
  const isEdit = Boolean(editing);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "user">("user");
  const [quotaGb, setQuotaGb] = React.useState("0");
  const [active, setActive] = React.useState(true);
  const [mustChange, setMustChange] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<UserFormResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(editing?.name || "");
    setEmail(editing?.email || "");
    setPassword("");
    setRole(editing?.role || "user");
    setQuotaGb(String(quotaBytesToGb(editing?.storageQuotaBytes || 0)));
    setActive(editing?.active ?? true);
    setMustChange(editing?.mustChangePassword ?? true);
    setError(null);
    setResult(null);
    setCopied(false);
  }, [open, editing]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const quotaBytes = gbToQuotaBytes(Number(quotaGb) || 0);
      if (isEdit && editing) {
        const payload: Record<string, unknown> = {
          name: name.trim(),
          role,
          active,
          quotaBytes,
          mustChangePassword: mustChange,
        };
        if (password.trim()) payload.newPassword = password.trim();
        await apiPatch(`/api/admin/users/${editing.id}`, payload);
        toast.success("User updated");
        onOpenChange(false);
        onSaved();
      } else {
        await apiPost("/api/admin/users", {
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          quotaBytes,
        });
        setResult({ email: email.trim(), password });
        onSaved();
        window.dispatchEvent(new CustomEvent("mycloud:changed"));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    name.trim().length > 0 &&
    (isEdit || (email.trim().length > 0 && password.length >= 12)) &&
    (!password || password.length >= 12);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto scrollbar-thin">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-500" /> Account created
              </DialogTitle>
              <DialogDescription>
                Share this temporary password with {result.email} through a secure channel.
                They will be required to choose a new password at first sign-in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Email
                </p>
                <p className="mt-1 break-all text-sm font-medium">{result.email}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Temporary password
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-sm">
                    {result.password}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={async () => {
                      await copyText(result.password);
                      setCopied(true);
                      toast.success("Password copied");
                    }}
                    aria-label="Copy temporary password"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                The password is shown only in this dialog. If you lose it, edit the account and
                set a new temporary password.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isEdit ? <Pencil className="h-5 w-5 text-primary" /> : <UserPlus className="h-5 w-5 text-primary" />}
                {isEdit ? `Edit ${editing?.name}` : "Create account"}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Update account details, permissions and quota. Role or password changes revoke active sessions."
                  : "Accounts are created by administrators only. There is no public signup."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-user-name">Display name</Label>
                <Input
                  id="admin-user-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-user-email">Email address</Label>
                <Input
                  id="admin-user-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={loading || isEdit}
                  autoComplete="off"
                />
                {isEdit ? (
                  <p className="text-xs text-muted-foreground">
                    Email addresses are permanent identifiers and cannot be changed.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-user-password">
                  {isEdit ? "New temporary password (optional)" : "Temporary password"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="admin-user-password"
                    type="text"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required={!isEdit}
                    minLength={password ? 12 : undefined}
                    autoComplete="new-password"
                    placeholder={isEdit ? "Leave blank to keep current password" : "At least 12 characters"}
                    disabled={loading}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPassword(generatePassword())}
                    disabled={loading}
                  >
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Must include upper and lowercase letters, a number and a symbol. Users must
                  change it at first sign-in.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="admin-user-role">Role</Label>
                  <Select
                    id="admin-user-role"
                    value={role}
                    onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "user")}
                    disabled={loading}
                  >
                    <option value="user">User</option>
                    <option value="admin">Administrator</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-user-quota">Quota (GB)</Label>
                  <Input
                    id="admin-user-quota"
                    type="number"
                    min={0}
                    step="0.5"
                    value={quotaGb}
                    onChange={(event) => setQuotaGb(event.target.value)}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">0 means unlimited.</p>
                </div>
              </div>

              {isEdit ? (
                <div className="space-y-3 rounded-lg border border-border bg-muted/25 p-3">
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium">Account active</span>
                      <span className="block text-xs text-muted-foreground">
                        Inactive accounts cannot sign in; files are preserved.
                      </span>
                    </span>
                    <Switch checked={active} onCheckedChange={setActive} disabled={loading} />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium">Require password change</span>
                      <span className="block text-xs text-muted-foreground">
                        User must set a new password at next sign-in.
                      </span>
                    </span>
                    <Switch checked={mustChange} onCheckedChange={setMustChange} disabled={loading} />
                  </label>
                </div>
              ) : null}

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={loading} disabled={!canSubmit}>
                  {isEdit ? "Save changes" : "Create account"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AdminUsersView() {
  const { me } = useUser();
  const [users, setUsers] = React.useState<UserDTO[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [limit] = React.useState(25);
  const [searchInput, setSearchInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserDTO | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<UserDTO | null>(null);
  const [deactivating, setDeactivating] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (query) params.set("q", query);
    if (roleFilter) params.set("role", roleFilter);
    if (activeFilter) params.set("active", activeFilter);
    setLoading(true);
    setError(null);
    apiGet<{ users: UserDTO[]; total: number; page: number; limit: number }>(
      `/api/admin/users?${params.toString()}`
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setUsers(response.users);
        setTotal(response.total);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, limit, query, roleFilter, activeFilter, refreshToken]);

  function reload() {
    setRefreshToken((value) => value + 1);
  }

  async function setActive(user: UserDTO, active: boolean) {
    try {
      await apiPatch(`/api/admin/users/${user.id}`, { active });
      toast.success(active ? "Account reactivated" : "Account deactivated");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function deactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await apiDelete(`/api/admin/users/${deactivateTarget.id}`);
      toast.success("Account deactivated");
      setDeactivateTarget(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeactivating(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <PageHeader
        title="Users"
        description="Create accounts, set quotas and control administrator access. There is no public signup."
        icon={<Users className="h-5 w-5" />}
        actions={
          <>
            <Button variant="ghost" size="icon-sm" onClick={reload} aria-label="Refresh users">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New user
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
          <form
            className="relative flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(searchInput.trim());
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                if (!event.target.value) {
                  setPage(1);
                  setQuery("");
                }
              }}
              placeholder="Search by name or email"
              className="pl-9"
              aria-label="Search users"
            />
          </form>
          <div className="flex gap-2">
            <Select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value);
                setPage(1);
              }}
              className="w-32"
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              <option value="admin">Admins</option>
              <option value="user">Users</option>
            </Select>
            <Select
              value={activeFilter}
              onChange={(event) => {
                setActiveFilter(event.target.value);
                setPage(1);
              }}
              className="w-32"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>
        </div>

        {error ? (
          <div className="px-4 py-10 text-center text-sm text-destructive">
            {error}
            <Button variant="outline" size="sm" className="ml-3" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading users…
          </div>
        ) : users.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">No users match those filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an account or clear the search.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-3 py-2.5 font-medium">Role</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Quota</th>
                  <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                  <th className="px-3 py-2.5 font-medium">Created</th>
                  <th className="w-12 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => {
                  const percent = user.storageQuotaBytes
                    ? Math.min(100, (user.usedBytes / user.storageQuotaBytes) * 100)
                    : 0;
                  const self = user.id === me.user.id;
                  return (
                    <tr key={user.id} className="transition-colors hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              user.active
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {initials(user.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate font-medium">
                              {user.name}
                              {self ? (
                                <Badge variant="outline" className="text-[10px]">
                                  You
                                </Badge>
                              ) : null}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          {user.role === "admin" ? "Admin" : "User"}
                        </Badge>
                        {user.mustChangePassword ? (
                          <Badge variant="warning" className="ml-1.5">
                            Temp password
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={user.active ? "success" : "muted"}>
                          {user.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="w-32">
                          <p className="text-xs tabular-nums">
                            {formatBytesClient(user.usedBytes)}
                            {user.storageQuotaBytes > 0
                              ? ` / ${formatBytesClient(user.storageQuotaBytes)}`
                              : " / ∞"}
                          </p>
                          {user.storageQuotaBytes > 0 ? (
                            <Progress
                              value={percent}
                              className="mt-1 h-1"
                              indicatorClassName={percent >= 95 ? "bg-destructive" : undefined}
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {user.lastLoginAt ? formatRelative(user.lastLoginAt) : "Never"}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.name}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(user);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" /> Edit account
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(user);
                                setFormOpen(true);
                              }}
                            >
                              <KeyRound className="h-4 w-4" /> Reset password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.active ? (
                              <DropdownMenuItem
                                destructive
                                disabled={self}
                                onSelect={() => setDeactivateTarget(user)}
                              >
                                <UserX className="h-4 w-4" /> Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => void setActive(user, true)}>
                                <ShieldCheck className="h-4 w-4" /> Reactivate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {total.toLocaleString()} account{total === 1 ? "" : "s"}
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

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={reload}
      />

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(value) => {
          if (!value) setDeactivateTarget(null);
        }}
        title="Deactivate this account?"
        description={
          deactivateTarget
            ? `${deactivateTarget.name} will be signed out and unable to sign in. Their files stay intact and the account can be reactivated later.`
            : ""
        }
        confirmLabel="Deactivate account"
        destructive
        loading={deactivating}
        onConfirm={deactivate}
      />
    </div>
  );
}
