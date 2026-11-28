"use client";

/**
 * use-theme — thin wrapper around next-themes.
 *
 * Usage:
 *   const { theme, toggleTheme, isDark } = useTheme();
 *
 * Persists to localStorage automatically via next-themes.
 * Respects system preference on first load (when no localStorage value exists).
 * The default follows the system appearance.
 */

import { useTheme as useNextTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribeToHydration = () => () => {};

export function useTheme() {
  const { theme, setTheme, resolvedTheme: clientTheme, systemTheme } = useNextTheme();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const resolvedTheme = hydrated ? clientTheme : undefined;

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
