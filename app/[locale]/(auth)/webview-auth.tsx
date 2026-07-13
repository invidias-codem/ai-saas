"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { SignIn } from "@clerk/nextjs";
import { ExternalLink, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

function isWebview(): boolean {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent || "";
  const webviewIndicators =
    /Instagram|Twitter|FBAV|FBAN|Snapchat|Threads|Pinterest|LinkedInApp|WhatsApp|com\.linkedin\.linkedin|com\.snapchat\.snapchat|com\.twitter\.android|com\.instagram\.android/i.test(
      ua,
    );

  if (webviewIndicators) return true;

  const hasStandalone = "standalone" in window.navigator && (window.navigator as any).standalone;
  const displayMode = window.matchMedia?.("(display-mode: browser)").matches === false;

  return hasStandalone && !displayMode;
}

export default function WebviewAwareAuth({
  locale,
  path,
  appearance,
  fallbackComponent,
}: {
  locale: string;
  path?: string;
  appearance?: any;
  fallbackComponent?: React.ReactNode;
}) {
  const router = useRouter();

  // Allow the user to dismiss the "open in browser" warning and try the
  // in-webview sign-in anyway.
  const [dismissed, setDismissed] = useState(false);

  // Detect webview client-side (window is unavailable during SSR).
  const webview = useSyncExternalStore(
    () => () => {},
    () => isWebview(),
    () => null as boolean | null
  );

  if (webview === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (webview && !dismissed) {
    const target = path ? `/${locale}${path}` : `/${locale}/sign-in`;

    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground p-6">
        <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center space-y-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Open in Browser</h1>
            <p className="text-sm text-muted-foreground">
              Google and some providers don’t allow sign-in inside in-app browsers (like Threads).
              Tap below to open this page in your system browser — your data stays private and
              the flow works as expected.
            </p>
          </div>
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={() => window.open(target, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-4 w-4" />
            Continue in Browser
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="text-xs text-muted-foreground"
          >
            Stay here (may fail)
          </Button>
        </div>
      </div>
    );
  }

  if (fallbackComponent) {
    return <div>{fallbackComponent}</div>;
  }

  return (
    <SignIn
      path={path || `/${locale}/sign-in`}
      appearance={{
        ...appearance,
      }}
    />
  );
}
