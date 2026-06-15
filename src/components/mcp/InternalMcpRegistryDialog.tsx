import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Checkbox } from "@/components/ui/checkbox";
import { mcpApi, type InternalMcpCatalogEntry } from "@/lib/api/mcp";
import { toast } from "sonner";

const DEFAULT_REGISTRY_URL = "https://mcp.int.rclabenv.com";

function isImportableEntry(entry: InternalMcpCatalogEntry): boolean {
  if (!entry.importContent?.trim()) return false;
  return ["sse", "streamable", "command"].includes(entry.importMethod);
}

interface InternalMcpRegistryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

export function InternalMcpRegistryDialog({
  open,
  onOpenChange,
  onImported,
}: InternalMcpRegistryDialogProps) {
  const { t } = useTranslation();
  const [registryUrl, setRegistryUrl] = useState(DEFAULT_REGISTRY_URL);
  const [entries, setEntries] = useState<InternalMcpCatalogEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadCatalog = async (url: string) => {
    setLoading(true);
    try {
      const data = await mcpApi.fetchInternalCatalog(
        url.trim() || DEFAULT_REGISTRY_URL,
      );
      setEntries(data);
      setSelected(
        new Set(data.filter(isImportableEntry).map((entry) => entry.id)),
      );
    } catch (error) {
      toast.error(t("common.error"), { description: String(error) });
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadCatalog(registryUrl);
    }
  }, [open]);

  const toggleEntry = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    try {
      const url = registryUrl.trim() || DEFAULT_REGISTRY_URL;
      const result = await mcpApi.importInternalServers(
        url,
        Array.from(selected),
      );

      if (result.imported > 0) {
        toast.success(
          t("mcp.internalRegistry.importSuccess", { count: result.imported }),
          { closeButton: true },
        );
      }

      if (result.skipped.length > 0) {
        const preview = result.skipped
          .slice(0, 3)
          .map((s) => s.title)
          .join(", ");
        toast.warning(
          t("mcp.internalRegistry.importSkipped", {
            count: result.skipped.length,
          }),
          {
            description: preview,
            duration: 12000,
            closeButton: true,
          },
        );
      }

      if (result.imported === 0 && result.skipped.length > 0) {
        toast.error(t("mcp.internalRegistry.importNone"));
      } else if (result.imported > 0) {
        onImported?.();
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(t("common.error"), { description: String(error) });
    } finally {
      setImporting(false);
    }
  };

  const importableSelectedCount = entries.filter(
    (e) => selected.has(e.id) && isImportableEntry(e),
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("mcp.internalRegistry.title")}</DialogTitle>
          <DialogDescription>
            {t("mcp.internalRegistry.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="mcp-registry-url">
            {t("mcp.internalRegistry.urlLabel")}
          </Label>
          <Input
            id="mcp-registry-url"
            value={registryUrl}
            onChange={(e) => setRegistryUrl(e.target.value)}
            placeholder={DEFAULT_REGISTRY_URL}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => loadCatalog(registryUrl)}
            disabled={loading}
          >
            {t("mcp.internalRegistry.load")}
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              {t("mcp.loading")}
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("mcp.internalRegistry.empty")}
            </p>
          ) : (
            entries.map((entry) => {
              const importable = isImportableEntry(entry);
              return (
                <label
                  key={entry.id}
                  className="flex items-start gap-3 rounded-lg border border-border-default p-3 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(entry.id)}
                    disabled={!importable}
                    onCheckedChange={(checked) =>
                      toggleEntry(entry.id, checked === true)
                    }
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{entry.title}</span>
                      {!importable && (
                        <span className="text-[10px] rounded border border-border-default px-1.5 py-0.5 text-muted-foreground">
                          {t("mcp.internalRegistry.manualOnly")}
                        </span>
                      )}
                    </div>
                    {entry.summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {entry.summary}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {entry.importMethod}
                    </p>
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || importableSelectedCount === 0}
          >
            {t("mcp.internalRegistry.importSelected", {
              count: importableSelectedCount,
            })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
