import { Eye } from "lucide-react";

import { MemoryModelPicker } from "@/components/assistant/MemoryModelPicker";
import { modelAcceptsImages } from "@/lib/visionFallback";
import type { ModelInfo } from "@/lib/opencode";
import type { WorkspacePreferences } from "@/lib/preferences";
import { t } from "@/lib/i18n";

interface VisionModelSettingProps {
  models: ModelInfo[];
  onChange: (value: WorkspacePreferences["visionModel"]) => void;
  value: WorkspacePreferences["visionModel"];
}

/**
 * Picks the model that converts images to text for conversation models that cannot read them.
 *
 * Only models that actually accept image input are offered — pointing this at a text-only model
 * would reproduce the exact failure it exists to avoid, and the modality is already declared in
 * the model catalogue, so there is no need to ask the user to know it.
 */
export function VisionModelSetting({ models, onChange, value }: VisionModelSettingProps) {
  const capable = models.filter(modelAcceptsImages);
  const selectedKey = value ? `${value.providerID}/${value.modelID}` : "";

  return (
    <section className="border-t border-border/50 py-5">
      <div className="flex items-center gap-2">
        <Eye className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("vision.settingsTitle")}</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("vision.settingsHint")}</p>
      <div className="mt-3 max-w-md">
        <MemoryModelPicker
          models={capable}
          onChange={(model) => onChange({ modelID: model.id, providerID: model.providerID })}
          value={selectedKey}
        />
      </div>
      {capable.length === 0 && (
        <p className="mt-2 text-[11px] leading-4 text-amber-600 dark:text-amber-500">
          {t("vision.noneAvailable")}
        </p>
      )}
    </section>
  );
}
