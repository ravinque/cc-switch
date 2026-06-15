import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Save, Plus } from "lucide-react";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LlmApiProfile } from "@/types";
import { useUpsertLlmApiProfile } from "@/hooks/useLlmApi";

interface LlmApiFormPanelProps {
  isOpen: boolean;
  editingProfile?: LlmApiProfile | null;
  onClose: () => void;
}

function slugifyId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `api-${Date.now()}`;
}

const LlmApiFormPanel: React.FC<LlmApiFormPanelProps> = ({
  isOpen,
  editingProfile,
  onClose,
}) => {
  const { t } = useTranslation();
  const upsertMutation = useUpsertLlmApiProfile();
  const isEdit = !!editingProfile;

  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("openai_compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (editingProfile) {
      setName(editingProfile.name);
      setVendor(editingProfile.vendor);
      setBaseUrl(editingProfile.baseUrl);
      setApiKey(editingProfile.apiKey);
      setNotes(editingProfile.notes ?? "");
    } else {
      setName("");
      setVendor("openai_compatible");
      setBaseUrl("");
      setApiKey("");
      setNotes("");
    }
  }, [isOpen, editingProfile]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("llmApi.form.nameRequired"));
      return;
    }

    const now = Date.now();
    const profile: LlmApiProfile = {
      id: editingProfile?.id ?? slugifyId(name),
      name: name.trim(),
      vendor,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      notes: notes.trim() || undefined,
      createdAt: editingProfile?.createdAt ?? now,
      updatedAt: now,
    };

    try {
      await upsertMutation.mutateAsync(profile);
      toast.success(t("common.success"), { closeButton: true });
      onClose();
    } catch (error) {
      toast.error(t("common.error"), { description: String(error) });
    }
  };

  return (
    <FullScreenPanel
      isOpen={isOpen}
      title={isEdit ? t("llmApi.form.editTitle") : t("llmApi.form.addTitle")}
      onClose={onClose}
      footer={
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={upsertMutation.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isEdit ? <Save size={16} /> : <Plus size={16} />}
          {upsertMutation.isPending
            ? t("common.saving")
            : isEdit
              ? t("common.save")
              : t("common.add")}
        </Button>
      }
    >
      <div className="glass rounded-xl p-6 border border-white/10 space-y-6 max-w-2xl">
        <div className="space-y-2">
          <Label htmlFor="llm-api-name">{t("llmApi.form.name")}</Label>
          <Input
            id="llm-api-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("llmApi.form.namePlaceholder")}
          />
        </div>

        <div className="space-y-2">
          <Label>{t("llmApi.form.vendor")}</Label>
          <Select value={vendor} onValueChange={setVendor}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai_compatible">
                {t("llmApi.vendors.openaiCompatible")}
              </SelectItem>
              <SelectItem value="anthropic">
                {t("llmApi.vendors.anthropic")}
              </SelectItem>
              <SelectItem value="gemini">
                {t("llmApi.vendors.gemini")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-api-base-url">{t("llmApi.form.baseUrl")}</Label>
          <Input
            id="llm-api-base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-api-key">{t("llmApi.form.apiKey")}</Label>
          <Input
            id="llm-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-api-notes">{t("llmApi.form.notes")}</Label>
          <Input
            id="llm-api-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("llmApi.form.notesPlaceholder")}
          />
        </div>
      </div>
    </FullScreenPanel>
  );
};

export default LlmApiFormPanel;
