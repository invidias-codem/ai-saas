"use client";

/**
 * use-theme — thin wrapper around next-themes.
 *
 * Usage:
 *   const { theme, toggleTheme, isDark } = useTheme();
 *
 * Persists to localStorage automatically via next-themes.
 * Respects system preference on first load (when no localStorage value exists).
 * Default theme is "dark" — light mode is opt-in.
 */

import { useTheme as useNextTheme } from "next-themes";

export function useTheme() {
  const { theme, setTheme, resolvedTheme, systemTheme } = useNextTheme();

  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return {
    theme,
    resolvedTheme,
    systemTheme,
    isDark,
    isLight: !isDark,
    setTheme,
    toggleTheme,
  };
}

export default useTheme;
