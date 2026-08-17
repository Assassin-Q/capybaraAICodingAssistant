import { useEffect } from "react";

const ASSISTANT_OVERLAY_DISMISS_EVENT = "capybara:close-assistant-overlays";

/** Close transient composer/header surfaces before opening a full-page settings view. */
export const closeAssistantOverlays = (): void => {
  window.dispatchEvent(new Event(ASSISTANT_OVERLAY_DISMISS_EVENT));
};

export const useAssistantOverlayDismiss = (onDismiss: () => void): void => {
  useEffect(() => {
    const dismiss = () => onDismiss();
    window.addEventListener(ASSISTANT_OVERLAY_DISMISS_EVENT, dismiss);
    return () => window.removeEventListener(ASSISTANT_OVERLAY_DISMISS_EVENT, dismiss);
  }, [onDismiss]);
};
