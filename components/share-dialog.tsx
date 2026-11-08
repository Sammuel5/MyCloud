"use client";

import * as React from "react";
import {
  CalendarClock,
  Check,
  Copy,
  Download,
  Eye,
  Info,
  Link2,
  Loader2,
  LockKeyhole,
  Mail,
  Share2,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/item-dialogs";
import { useUser } from "@/components/user-context";
import { apiDelete, apiGet, apiPost, errorMessage } from "@/lib/api-client";
import { formatShortDate } from "@/lib/format";
import type { ItemDTO, ShareDTO, ShareLinkDTO, SharesResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CreatedLink {
  id: string;
  path: string;
  expiresAt: string | null;
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
  }
}

export function ShareDialog({
  item,
  open,
  onOpenChange,
}: {
  item: ItemDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { me } = useUser();
  const [shares, setShares] = React.useState<ShareDTO[]>([]);
  const [links, setLinks] = React.useState<ShareLinkDTO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"viewer" | "editor">("viewer");
  const [inviting, setInviting] = React.useState(false);
  const [showLinkForm, setShowLinkForm] = React.useState(false);
  const [linkPassword, setLinkPassword] = React.useState("");
  const [linkExpires, setLinkExpires] = React.useState("30");
  const [allowDownload, setAllowDownload] = React.useState(true);
  const [creatingLink, setCreatingLink] = React.useState(false);
  const [createdLink, setCreatedLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [removeShare, setRemoveShare] = React.useState<ShareDTO | null>(null);
  const [revokeLink, setRevokeLink] = React.useState<ShareLinkDTO | null>(null);
  const [removing, setRemoving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!item) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<SharesResponse>(
        `/api/items/${item.type}/${item.id}/shares`
      );
      setShares(response.shares);
      setLinks(response.links);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [item]);

  React.useEffect(() => {
    if (!open || !item) return;
    setInviteEmail("");
    setInviteRole("viewer");
    setShowLinkForm(false);
    setLinkPassword("");
    setLinkExpires("30");
    setAllowDownload(true);
    setCreatedLink(null);
    setCopied(false);
    void load();
  }, [open, item, load]);

  if (!item) return null;

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!item || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await apiPost("/api/shares", {
        resourceType: item.type,
        resourceId: item.id,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      toast.success(`Shared with ${inviteEmail.trim()}`);
      setInviteEmail("");
      await load();
      window.dispatchEvent(new CustomEvent("mycloud:changed"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setInviting(false);
    }
  }

  async function createLink(event: React.FormEvent) {
    event.preventDefault();
    if (!item) return;
    if (linkPassword && linkPassword.length < 8) {
      toast.error("Link passwords must be at least 8 characters.");
      return;
    }
    setCreatingLink(true);
    setCreatedLink(null);
    setCopied(false);
    try {
      const response = await apiPost<{ link: CreatedLink }>(
        `/api/items/${item.type}/${item.id}/links`,
        {
          resourceType: item.type,
          resourceId: item.id,
          password: linkPassword || undefined,
          expiresInDays: linkExpires === "never" ? undefined : Number(linkExpires),
          allowDownload,
        }
      );
      const url = `${window.location.origin}${response.link.path}`;
      setCreatedLink(url);
      setShowLinkForm(false);
      setLinkPassword("");
      toast.success("Public link created");
      await load();
      window.dispatchEvent(new CustomEvent("mycloud:changed"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreatingLink(false);
    }
  }

  async function confirmRemoveShare() {
    if (!removeShare) return;
    setRemoving(true);
    try {
      await apiDelete(`/api/shares/${removeShare.id}`);
      toast.success("Access removed");
      setRemoveShare(null);
      await load();
      window.dispatchEvent(new CustomEvent("mycloud:changed"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoving(false);
    }
  }

  async function confirmRevokeLink() {
    if (!revokeLink) return;
    setRemoving(true);
    try {
      await apiDelete(`/api/links/${revokeLink.id}`);
      toast.success("Link revoked");
      setRevokeLink(null);
      await load();
      window.dispatchEvent(new CustomEvent("mycloud:changed"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Share2 className="h-5 w-5 text-primary" />
              <span className="min-w-0 truncate">Share “{item.name}”</span>
            </DialogTitle>
            <DialogDescription>
              Invite other accounts on this server, or create a link for people outside it.
              {item.type === "folder"
                ? " Folder sharing includes everything inside the folder."
                : ""}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading sharing settings…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : (
            <div className="space-y-6">
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">People with access</h3>
                  <Badge variant="secondary">{shares.length}</Badge>
                </div>

                <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="name@example.com"
                      className="pl-9"
                      aria-label="Email address to share with"
                      disabled={inviting}
                    />
                  </div>
                  <Select
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.target.value === "editor" ? "editor" : "viewer")
                    }
                    className="sm:w-32"
                    aria-label="Permission role"
                    disabled={inviting}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </Select>
                  <Button type="submit" loading={inviting} disabled={!inviteEmail.trim()}>
                    <UserPlus className="h-4 w-4" /> Invite
                  </Button>
                </form>

                {shares.length === 0 ? (
                  <p className="rounded-lg bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                    Only you have access right now.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {shares.map((share) => (
                      <li key={share.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {share.user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{share.user.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {share.user.email}
                          </p>
                        </div>
                        <Badge variant={share.role === "editor" ? "default" : "secondary"}>
                          {share.role}
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setRemoveShare(share)}
                          aria-label={`Remove access for ${share.user.email}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Separator />

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Public links</h3>
                    <p className="text-xs text-muted-foreground">
                      Anyone with the link can open this item. Links can be revoked at any time.
                    </p>
                  </div>
                  {me.settings.publicSharingEnabled ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={showLinkForm ? "outline" : "default"}
                      onClick={() => setShowLinkForm((value) => !value)}
                    >
                      <Link2 className="h-4 w-4" /> New link
                    </Button>
                  ) : null}
                </div>

                {!me.settings.publicSharingEnabled ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    Public sharing is disabled by the administrator. Internal collaborator
                    sharing still works.
                  </div>
                ) : null}

                {createdLink ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                      <Check className="h-4 w-4" /> Link ready — copy it now
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Input
                        readOnly
                        value={createdLink}
                        className="bg-background font-mono text-xs"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          await copyText(createdLink);
                          setCopied(true);
                          toast.success("Link copied");
                        }}
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-emerald-800/80 dark:text-emerald-300/80">
                      For security, this full URL is only shown once. You can create a new link
                      later if you lose it.
                    </p>
                  </div>
                ) : null}

                {showLinkForm && me.settings.publicSharingEnabled ? (
                  <form
                    onSubmit={createLink}
                    className="space-y-3 rounded-lg border border-border bg-muted/25 p-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="link-password" className="flex items-center gap-1.5">
                          <LockKeyhole className="h-3.5 w-3.5" /> Password (optional)
                        </Label>
                        <Input
                          id="link-password"
                          type="password"
                          autoComplete="new-password"
                          value={linkPassword}
                          onChange={(event) => setLinkPassword(event.target.value)}
                          placeholder="At least 8 characters"
                          minLength={8}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="link-expiry" className="flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5" /> Expires
                        </Label>
                        <Select
                          id="link-expiry"
                          value={linkExpires}
                          onChange={(event) => setLinkExpires(event.target.value)}
                        >
                          <option value="1">After 1 day</option>
                          <option value="7">After 7 days</option>
                          <option value="30">After 30 days</option>
                          <option value="90">After 90 days</option>
                          <option value="never">Never</option>
                        </Select>
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Switch
                        checked={allowDownload}
                        onCheckedChange={setAllowDownload}
                        aria-label="Allow downloads"
                      />
                      <Download className="h-4 w-4 text-muted-foreground" />
                      Allow downloads
                    </label>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowLinkForm(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" loading={creatingLink}>
                        Create link
                      </Button>
                    </div>
                  </form>
                ) : null}

                {links.length === 0 ? (
                  <p className="rounded-lg bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                    No active public links.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {links.map((link) => (
                      <li
                        key={link.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2.5"
                      >
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm">
                            {link.hasPassword ? (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <LockKeyhole className="h-3 w-3" /> Password
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">No password</span>
                            )}
                            <span className="text-muted-foreground">·</span>
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Eye className="h-3 w-3" /> {link.accessCount} views
                            </span>
                            {link.allowDownload ? (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Download className="h-3 w-3" /> Downloads on
                                </span>
                              </>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Created {formatShortDate(link.createdAt)} ·{" "}
                            {link.expiresAt
                              ? `expires ${formatShortDate(link.expiresAt)}`
                              : "never expires"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRevokeLink(link)}
                          className="text-destructive hover:text-destructive"
                        >
                          Revoke
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className={cn("flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground")}>
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Viewers can browse and download. Editors can also upload, rename, move and
                  delete. Only the owner can manage sharing. Public links never expose your
                  storage paths.
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removeShare)}
        onOpenChange={(value) => {
          if (!value) setRemoveShare(null);
        }}
        title="Remove access?"
        description={
          removeShare
            ? `${removeShare.user.name} will lose access to “${item.name}”.`
            : ""
        }
        confirmLabel="Remove access"
        destructive
        loading={removing}
        onConfirm={confirmRemoveShare}
      />

      <ConfirmDialog
        open={Boolean(revokeLink)}
        onOpenChange={(value) => {
          if (!value) setRevokeLink(null);
        }}
        title="Revoke this link?"
        description="The URL will stop working immediately. This cannot be undone, but you can create a new link."
        confirmLabel="Revoke link"
        destructive
        loading={removing}
        onConfirm={confirmRevokeLink}
      />
    </>
  );
}
