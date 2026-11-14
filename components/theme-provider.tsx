"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// Suppress the React 19 false positive warning for next-themes script tag in development
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Encountered a script tag")) {
      return;
    }
    origError.apply(console, args);
  };
}

// A saved workspace preference takes precedence over the old public-page key.
const migrateLaunchTheme = `try {
  var launchTheme = localStorage.getItem('lattice-launch-theme');
  if (!localStorage.getItem('theme') && (launchTheme === 'light' || launchTheme === 'dark')) {
    localStorage.setItem('theme', launchTheme);
  }
} catch {}`;

function BrowserThemeColor() {
  React.useEffect(() => {
    const root = document.documentElement;
    const updateColor = () => {
      const color = getComputedStyle(root).getPropertyValue("--lattice-canvas").trim();
      if (!color) return;
      document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
        if (meta.getAttribute("content") !== color) meta.setAttribute("content", color);
      });
    };
    const observer = new MutationObserver(updateColor);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.head, { childList: true });
    updateColor();
    return () => observer.disconnect();
  }, []);

  return null;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: migrateLaunchTheme }} />
      <NextThemesProvider {...props}>
        <BrowserThemeColor />
        {children}
      </NextThemesProvider>
    </>
  );
}
