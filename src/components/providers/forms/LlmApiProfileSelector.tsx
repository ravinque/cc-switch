import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLlmApiProfiles } from "@/hooks/useLlmApi";

interface LlmApiProfileSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onOpenLibrary?: () => void;
}

export function LlmApiProfileSelector({
  selectedIds,
  onChange,
  onOpenLibrary,
}: LlmApiProfileSelectorProps) {
  const { t } = useTranslation();
  const { data: profilesMap, isLoading } = useLlmApiProfiles();

  const profiles = useMemo(() => {
    if (!profilesMap) return [];
    return Object.values(profilesMap).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [profilesMap]);

  const toggleProfile = (id: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter((item) => item !== id));
    }
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...selectedIds];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-default p-4 space-y-2">
        <p className="text-sm text-muted-foreground">{t("llmApi.selector.empty")}</p>
        {onOpenLibrary && (
          <Button type="button" variant="outline" size="sm" onClick={onOpenLibrary}>
            <ExternalLink className="w-4 h-4 mr-2" />
            {t("llmApi.selector.openLibrary")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border-default p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="text-sm font-medium">{t("llmApi.selector.title")}</Label>
          <p className="text-xs text-muted-foreground mt-1">
            {t("llmApi.selector.hint")}
          </p>
        </div>
        {onOpenLibrary && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={onOpenLibrary}
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            {t("llmApi.selector.manage")}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {profiles.map((profile) => {
          const checked = selectedIds.includes(profile.id);
          const orderIndex = selectedIds.indexOf(profile.id);
          const isPrimary = orderIndex === 0;

          return (
            <div
              key={profile.id}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <Checkbox
                id={`llm-api-${profile.id}`}
                checked={checked}
                onCheckedChange={(value) =>
                  toggleProfile(profile.id, value === true)
                }
              />
              <label
                htmlFor={`llm-api-${profile.id}`}
                className="flex-1 min-w-0 cursor-pointer"
              >
                <span className="text-sm font-medium">{profile.name}</span>
                {profile.baseUrl && (
                  <span className="text-xs text-muted-foreground ml-2 truncate">
                    {profile.baseUrl}
                  </span>
                )}
                {isPrimary && (
                  <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
                    {t("llmApi.selector.primary")}
                  </span>
                )}
                {checked && !isPrimary && orderIndex > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("llmApi.selector.failover", { order: orderIndex + 1 })}
                  </span>
                )}
              </label>
              {checked && orderIndex > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => moveUp(orderIndex)}
                >
                  {t("llmApi.selector.moveUp")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
