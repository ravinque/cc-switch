import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Globe, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { webUiApi } from "@/lib/api/webUi";
import { isTauriRuntime } from "@/lib/runtime";

interface WebUiSettingsProps {
  enabled: boolean;
  port?: number;
  onAutoSave: (patch: { enableWebUi?: boolean; webUiPort?: number }) => void;
}

export function WebUiSettings({
  enabled,
  port = 8787,
  onAutoSave,
}: WebUiSettingsProps) {
  const { t } = useTranslation();
  const [statusLoading, setStatusLoading] = useState(false);
  const [status, setStatus] = useState<{
    url?: string;
    token?: string;
    running?: boolean;
    distAvailable?: boolean;
  } | null>(null);

  const refreshStatus = async () => {
    if (!isTauriRuntime()) return;
    setStatusLoading(true);
    try {
      const next = await webUiApi.getStatus();
      setStatus({
        url: next.url,
        token: next.token,
        running: next.running,
        distAvailable: next.distAvailable,
      });
    } catch (error) {
      toast.error(t("common.error"), { description: String(error) });
    } finally {
      setStatusLoading(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    onAutoSave({ enableWebUi: checked });
    if (!isTauriRuntime()) return;
    try {
      const next = await webUiApi.setEnabled(checked, port);
      setStatus({
        url: next.url,
        token: next.token,
        running: next.running,
        distAvailable: next.distAvailable,
      });
      toast.success(
        checked ? t("webUi.enabledSuccess") : t("webUi.disabledSuccess"),
        { closeButton: true },
      );
    } catch (error) {
      toast.error(t("common.error"), { description: String(error) });
    }
  };

  const copyAccessUrl = async () => {
    if (!status?.url || !status.token) {
      await refreshStatus();
      return;
    }
    const accessUrl = `${status.url}?token=${status.token}`;
    try {
      if (isTauriRuntime()) {
        const { copyText } = await import("@/lib/clipboard");
        await copyText(accessUrl);
      } else {
        await navigator.clipboard.writeText(accessUrl);
      }
      toast.success(t("webUi.copied"), { closeButton: true });
    } catch (error) {
      toast.error(t("common.error"), { description: String(error) });
    }
  };

  return (
    <div className="glass rounded-xl p-6 border border-white/10 space-y-5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Globe className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-1">
          <h3 className="font-medium">{t("webUi.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("webUi.description")}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="enable-web-ui">{t("webUi.enable")}</Label>
        <Switch
          id="enable-web-ui"
          checked={enabled}
          onCheckedChange={(checked) => void handleToggle(checked)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="web-ui-port">{t("webUi.port")}</Label>
        <Input
          id="web-ui-port"
          type="number"
          min={1024}
          max={65535}
          value={port}
          onChange={(e) =>
            onAutoSave({ webUiPort: Number.parseInt(e.target.value, 10) || 8787 })
          }
          disabled={!enabled}
        />
        <p className="text-xs text-muted-foreground">{t("webUi.portHint")}</p>
      </div>

      {enabled && isTauriRuntime() && (
        <div className="space-y-3 pt-2 border-t border-border-default">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshStatus()}
              disabled={statusLoading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t("webUi.refreshStatus")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyAccessUrl()}>
              <Copy className="w-4 h-4 mr-2" />
              {t("webUi.copyUrl")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void webUiApi.openInBrowser().catch((e) => toast.error(String(e)))}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {t("webUi.openBrowser")}
            </Button>
          </div>
          {status && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                {t("webUi.statusRunning")}:{" "}
                <span className="text-foreground">
                  {status.running ? t("webUi.running") : t("webUi.stopped")}
                </span>
              </div>
              {status.url && <div>{t("webUi.statusUrl")}: {status.url}</div>}
              {!status.distAvailable && (
                <div className="text-amber-600 dark:text-amber-400">
                  {t("webUi.distMissing")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
