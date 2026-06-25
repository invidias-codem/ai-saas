import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";

export function initSentry() {
  if (!env.SENTRY_DSN) {
    if (process.env.NODE_ENV === "development") {
      console.log("[Sentry] DSN not configured; skipping initialization.");
    }
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    enabled: true,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
