import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeyRound, Edit3, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  useDeleteLlmApiProfile,
  useImportLlmApiProfiles,
  useLlmApiProfiles,
} from "@/hooks/useLlmApi";
import type { LlmApiProfile } from "@/types";
import { ConfirmDialog } from "../ConfirmDialog";
import { ListItemRow } from "@/components/common/ListItemRow";
import LlmApiFormPanel from "./LlmApiFormPanel";

interface LlmApiPanelProps {
  onOpenChange: (open: boolean) => void;
}

export interface LlmApiPanelHandle {
  openAdd: () => void;
  openImport: () => void;
}

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= 8) return "••••••••";
  return `••••${trimmed.slice(-4)}`;
}

function vendorLabel(vendor: string, t: (key: string) => string): string {
  switch (vendor) {
    case "anthropic":
      return t("llmApi.vendors.anthropic");
    case "gemini":
      return t("llmApi.vendors.gemini");
    default:
      return t("llmApi.vendors.openaiCompatible");
  }
}

const LlmApiPanel = React.forwardRef<LlmApiPanelHandle, LlmApiPanelProps>(
  ({ onOpenChange: _onOpenChange }, ref) => {
    const { t } = useTranslation();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<LlmApiProfile | null>(
      null,
    );
    const [confirmDialog, setConfirmDialog] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
    } | null>(null);

    const { data: profilesMap, isLoading } = useLlmApiProfiles();
    const deleteMutation = useDeleteLlmApiProfile();
    const importMutation = useImportLlmApiProfiles();

    const profileEntries = useMemo((): Array<[string, LlmApiProfile]> => {
      if (!profilesMap) return [];
      return Object.entries(profilesMap);
    }, [profilesMap]);

    const handleAdd = () => {
      setEditingProfile(null);
      setIsFormOpen(true);
    };

    const handleImport = async () => {
      try {
        const result = await importMutation.mutateAsync();
        if (result.imported === 0) {
          toast.success(t("llmApi.importNone"), { closeButton: true });
        } else {
          toast.success(
            t("llmApi.importSuccess", {
              imported: result.imported,
              skipped: result.skipped,
            }),
            { closeButton: true },
          );
        }
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    React.useImperativeHandle(ref, () => ({
      openAdd: handleAdd,
      openImport: handleImport,
    }));

    const handleEdit = (profile: LlmApiProfile) => {
      setEditingProfile(profile);
      setIsFormOpen(true);
    };

    const handleDelete = (id: string, name: string) => {
      setConfirmDialog({
        isOpen: true,
        title: t("llmApi.deleteTitle"),
        message: t("llmApi.deleteConfirm", { name }),
        onConfirm: async () => {
          try {
            await deleteMutation.mutateAsync(id);
            setConfirmDialog(null);
            toast.success(t("common.success"), { closeButton: true });
          } catch (error) {
            toast.error(t("common.error"), { description: String(error) });
          }
        },
      });
    };

    const handleCloseForm = () => {
      setIsFormOpen(false);
      setEditingProfile(null);
    };

    return (
      <TooltipProvider delayDuration={300}>
        <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-shrink-0 py-4 glass rounded-xl border border-white/10 mb-4 px-6 flex items-center justify-between gap-4">
            <Badge variant="outline" className="bg-background/50 h-7 px-3">
              {t("llmApi.profileCount", { count: profileEntries.length })}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t("llmApi.summaryHint")}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden pb-24">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                {t("common.loading")}
              </div>
            ) : profileEntries.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                  <KeyRound size={24} className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {t("llmApi.empty")}
                </h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  {t("llmApi.emptyHint")}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border-default overflow-hidden">
                {profileEntries.map(([id, profile], index) => (
                  <ListItemRow
                    key={id}
                    isLast={index === profileEntries.length - 1}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{profile.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        <Badge
                          variant="secondary"
                          className="mr-2 h-5 px-2 text-[10px] font-normal"
                        >
                          {vendorLabel(profile.vendor, t)}
                        </Badge>
                        {profile.baseUrl || t("llmApi.noBaseUrl")}
                        <span className="mx-1">·</span>
                        {maskApiKey(profile.apiKey)}
                      </div>
                      {profile.notes && (
                        <div className="text-xs text-muted-foreground/80 truncate mt-0.5">
                          {profile.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(profile)}
                        title={t("common.edit")}
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(id, profile.name)}
                        title={t("common.delete")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </ListItemRow>
                ))}
              </div>
            )}
          </div>

          <LlmApiFormPanel
            isOpen={isFormOpen}
            editingProfile={editingProfile}
            onClose={handleCloseForm}
          />

          {confirmDialog && (
            <ConfirmDialog
              isOpen={confirmDialog.isOpen}
              title={confirmDialog.title}
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={() => setConfirmDialog(null)}
            />
          )}
        </div>
      </TooltipProvider>
    );
  },
);

LlmApiPanel.displayName = "LlmApiPanel";

export default LlmApiPanel;
