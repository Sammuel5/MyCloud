"use client";

import * as React from "react";
import {
  AlertTriangle,
  Camera,
  Clock,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  Settings,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPatch, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

interface AdminSettings {
  publicSharingEnabled: boolean;
  trashRetentionDays: number;
  allowCameraUpload: boolean;
  updatedAt: string;
}

export function AdminSettingsView() {
  const [settings, setSettings] = React.useState<AdminSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<{ settings: AdminSettings }>("/api/admin/settings");
      setSettings(response.settings);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!settings) return;
    if (
      !Number.isInteger(settings.trashRetentionDays) ||
      settings.trashRetentionDays < 1 ||
      settings.trashRetentionDays > 3650
    ) {
      toast.error("Retention must be a whole number between 1 and 3650 days.");
      return;
    }
    setSaving(true);
    try {
      const response = await apiPatch<{ settings: AdminSettings }>("/api/admin/settings", {
        publicSharingEnabled: settings.publicSharingEnabled,
        trashRetentionDays: settings.trashRetentionDays,
        allowCameraUpload: settings.allowCameraUpload,
      });
      setSettings(response.settings);
      toast.success("System settings saved");
      window.dispatchEvent(new CustomEvent("mycloud:changed"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="System settings"
        description="Server-wide behavior that applies to every account."
        icon={<Settings className="h-5 w-5" />}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void load()}
              aria-label="Reload settings"
            >
              <RefreshCw className={cnSpinner(loading)} />
            </Button>
            <Button onClick={() => void save()} loading={saving} disabled={!settings}>
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </>
        }
      />

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : loading || !settings ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading settings…
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" /> Public sharing
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Allow owners to create password-protected or expiring links that work without
                  an account.
                </p>
              </div>
              <Switch
                checked={settings.publicSharingEnabled}
                onCheckedChange={(value) =>
                  setSettings((current) =>
                    current ? { ...current, publicSharingEnabled: value } : current
                  )
                }
                aria-label="Enable public sharing"
              />
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Public links bypass account authentication. They are disabled by default and
                  can be revoked individually. Prefer Tailscale-only access for sensitive files,
                  and consider adding a password and expiry date to every link.
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={settings.publicSharingEnabled ? "warning" : "success"}>
                  {settings.publicSharingEnabled ? "Enabled" : "Disabled"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {settings.publicSharingEnabled
                    ? "Owners can create public links."
                    : "Public endpoint returns 404 for all links."}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Recycle bin retention
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Deleted items are permanently removed by the maintenance worker after this many
                days.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="trash-retention">Retention period (days)</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="trash-retention"
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  value={String(settings.trashRetentionDays)}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            trashRetentionDays: Number.parseInt(event.target.value, 10) || 0,
                          }
                        : current
                    )
                  }
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  days ({Math.round(settings.trashRetentionDays / 7)} weeks)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Existing items use the current value at cleanup time. Shortening retention can
                cause older deleted items to be removed on the next worker run.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-primary" /> Camera uploads
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Show the camera capture option in the upload UI for phones.
                </p>
              </div>
              <Switch
                checked={settings.allowCameraUpload}
                onCheckedChange={(value) =>
                  setSettings((current) =>
                    current ? { ...current, allowCameraUpload: value } : current
                  )
                }
                aria-label="Allow camera uploads"
              />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Uploaded media is treated like any other file: original bytes are stored locally,
                validated, and thumbnailed on this server.
              </p>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            Last updated {formatDate(settings.updatedAt)}
          </p>
        </div>
      )}
    </div>
  );
}

function cnSpinner(loading: boolean): string {
  return loading ? "h-4 w-4 animate-spin" : "h-4 w-4";
}
