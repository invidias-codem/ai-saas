"use client";

import { useEffect } from "react";

/**
 * Registers the Sovereign AI Telemetry Service Worker (public/sw-telemetry.js).
 * Guarded for the browser; if registration or SW is unavailable, telemetry
 * simply doesn't capture at the edge (graceful degradation — never blocks UI).
 */
export function TelemetryServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw-telemetry.js", { scope: "/" });
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[telemetry] SW registration skipped (non-blocking):", err);
        }
      }
    };
    register();
  }, []);

  return null;
}
