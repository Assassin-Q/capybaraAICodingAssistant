import { useCallback, useState } from "react";

import { ideaApi } from "@/lib/idea";

export type IdeaTheme = "dark" | "light";

const setDocumentTheme = (theme: IdeaTheme) => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
};

export function useIdeaTheme() {
  const [theme, setTheme] = useState<IdeaTheme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );

  /** Applies a theme that came *from* IDEA — does not push back, to avoid a loop. */
  const applyIdeaTheme = useCallback((nextTheme: IdeaTheme) => {
    setDocumentTheme(nextTheme);
    setTheme(nextTheme);
  }, []);

  /**
   * User-initiated toggle: switches IDEA's look-and-feel too, so the IDE and the panel do not
   * end up on opposite themes. The IDE push is best-effort — the panel still switches if the
   * bridge is unavailable (for example in the standalone dev server).
   */
  const toggleTheme = useCallback(() => {
    const next: IdeaTheme = theme === "dark" ? "light" : "dark";
    applyIdeaTheme(next);
    void ideaApi.setIdeaTheme(next).catch(() => undefined);
  }, [applyIdeaTheme, theme]);

  return { applyIdeaTheme, theme, toggleTheme };
}
