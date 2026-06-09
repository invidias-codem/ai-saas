"use client";

import { open } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";
import { Shield, ExternalLink } from "lucide-react";

export default function DesktopLogin() {
  const handleNativeLogin = async () => {
    // Bounce to the system browser for Clerk OAuth.
    // The publishable key must be provided, or the direct Clerk Accounts URL.
    // We construct the standard Clerk Frontend API redirect.
    // Assuming NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is pk_test_... 
    // We can extract the FAPI URL from it.
    const fapiUrl = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY 
      ? `https://${atob(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.replace('pk_test_', '').replace('pk_live_', '')).split('$')[1]}`
      : "https://accounts.clerk.dev"; // Fallback

    const redirectUri = encodeURIComponent("latticeos://auth");
    
    // Open the system browser to the Clerk hosted sign-in page, 
    // which will redirect back to our custom deep link upon success.
    await open(`${fapiUrl}/sign-in?redirect_url=${redirectUri}`);
  };

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
      <div className="mx-auto flex max-w-[400px] flex-col items-center justify-center space-y-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Secure Desktop Access</h1>
          <p className="text-sm text-muted-foreground">
            Lattice OS uses your default web browser to securely authenticate your session, keeping your credentials isolated from the native desktop environment.
          </p>
        </div>

        <Button onClick={handleNativeLogin} size="lg" className="w-full gap-2">
          <ExternalLink className="h-4 w-4" />
          Authenticate in Browser
        </Button>
      </div>
    </div>
  );
}
