import { useCallback, useState } from "react";

export type IdeaTheme = "dark" | "light";

const setDocumentTheme = (theme: IdeaTheme) => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
};

export function useIdeaTheme() {
  const [theme, setTheme] = useState<IdeaTheme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );

  const applyIdeaTheme = useCallback((nextTheme: IdeaTheme) => {
    setDocumentTheme(nextTheme);
    setTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    applyIdeaTheme(theme === "dark" ? "light" : "dark");
  }, [applyIdeaTheme, theme]);

  return { applyIdeaTheme, theme, toggleTheme };
}
