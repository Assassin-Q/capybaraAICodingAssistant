import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManagedSkillList } from "@/components/assistant/ManagedSkillList";
import { SkillHubPanel } from "@/components/assistant/SkillHubPanel";
import { t } from "@/lib/i18n";

interface SkillSettingsProps {
  disabledSkillNames: string[];
  onDisabledSkillNamesChange: (names: string[]) => void;
  /** Re-reads the composer's skill list, so an install or a toggle shows up without a reopen. */
  onChanged: () => void;
  projectPath?: string;
}

/**
 * One list, sourced from disk and cross-referenced with what OpenCode has loaded. The old
 * split between "running" (OpenCode's view) and "installed" (the filesystem's view) had two
 * switches that did different things, which was easy to misread.
 */
export function SkillSettings({ onChanged, ...props }: SkillSettingsProps) {
  const [reloadToken, setReloadToken] = useState(0);

  return (
    <Tabs className="flex min-h-0 flex-1 flex-col overflow-hidden" defaultValue="installed">
      <TabsList>
        <TabsTrigger value="installed">{t("s_eb88ff57c9")}</TabsTrigger>
        <TabsTrigger value="hub">SkillHub</TabsTrigger>
      </TabsList>
      <TabsContent className="flex min-h-0 flex-1 flex-col overflow-hidden" value="installed">
        <ManagedSkillList {...props} onChanged={onChanged} reloadToken={reloadToken} />
      </TabsContent>
      <TabsContent className="flex min-h-0 flex-1 flex-col overflow-hidden" value="hub">
        <SkillHubPanel
          onInstalled={() => {
            setReloadToken((current) => current + 1);
            onChanged();
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
