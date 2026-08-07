import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import { modelRefWithAvailableVariant, modelSupportsVariant } from "@/components/assistant/modelVariants";
import { errorMessage } from "@/components/assistant/shared";
import { openCodeApi } from "@/lib/opencode";
import type { ModelInfo, ModelRef, SessionInfo } from "@/lib/opencode";

interface ModelVariantGuardInput {
  model?: ModelInfo;
  projectPath?: string;
  selectedSessionID: string;
  selectedVariant?: string;
  setError: Dispatch<SetStateAction<string>>;
  setSelectedVariant: Dispatch<SetStateAction<string | undefined>>;
  setSessions: Dispatch<SetStateAction<SessionInfo[]>>;
}

export function useModelVariantGuard({
  model,
  projectPath,
  selectedSessionID,
  selectedVariant,
  setError,
  setSelectedVariant,
  setSessions,
}: ModelVariantGuardInput) {
  const activeSessionID = useRef(selectedSessionID);
  const correction = useRef<{ key: string; promise: Promise<ModelRef> }>();

  useEffect(() => {
    activeSessionID.current = selectedSessionID;
  }, [selectedSessionID]);

  const ensureAvailableVariant = useCallback(async (): Promise<ModelRef | undefined> => {
    if (!model) return undefined;
    const nextRef = modelRefWithAvailableVariant(model, selectedVariant);
    if (!selectedVariant || modelSupportsVariant(model, selectedVariant) || !selectedSessionID || !projectPath) {
      return nextRef;
    }

    const key = `${selectedSessionID}:${model.providerID}/${model.id}:${selectedVariant}`;
    if (correction.current?.key === key) return correction.current.promise;
    const promise = openCodeApi.switchModel(selectedSessionID, nextRef, projectPath).then(() => {
      setSessions((current) => current.map((session) => session.id === selectedSessionID
        ? { ...session, model: nextRef }
        : session));
      if (activeSessionID.current === selectedSessionID) setSelectedVariant(undefined);
      return nextRef;
    }).finally(() => {
      if (correction.current?.key === key) correction.current = undefined;
    });
    correction.current = { key, promise };
    return promise;
  }, [model, projectPath, selectedSessionID, selectedVariant, setSelectedVariant, setSessions]);

  useEffect(() => {
    if (!selectedVariant || modelSupportsVariant(model, selectedVariant)) return;
    void ensureAvailableVariant().catch((guardError) => setError(errorMessage(guardError)));
  }, [ensureAvailableVariant, model, selectedVariant, setError]);

  return ensureAvailableVariant;
}
