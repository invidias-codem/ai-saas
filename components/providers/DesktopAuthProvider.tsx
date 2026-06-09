"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

import { Clerk } from "@clerk/clerk-js";
import { Loader2 } from "lucide-react";

export function DesktopAuthProvider({ children }: { children: React.ReactNode }) {
  const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === "true";
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(!isDesktop); // Ready immediately on web

  useEffect(() => {
    if (!isDesktop) return;

    let unlisten: (() => void) | null = null;
    let strongholdStore: any = null;
    let clerkInstance: Clerk | null = null;

    const initDesktopAuth = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const { Stronghold } = await import("@tauri-apps/plugin-stronghold");
        const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!
        clerkInstance = new Clerk(publishableKey);
        await clerkInstance.load();

        // 1. Initialize Stronghold Enclave
        // Note: Password should ideally be derived from an OS native secure prompt or device hardware key,
        // but for this implementation we use a fixed app-level salt.
        const stronghold = await Stronghold.load(".lattice_auth.vault", "lattice_secure_enclave_key_123");
        
        let client;
        try {
          client = await stronghold.loadClient("clerk_client");
        } catch (e) {
          client = await stronghold.createClient("clerk_client");
        }
        strongholdStore = client.getStore();

        // 2. Hydrate session from Stronghold
        const savedTokenBytes = await strongholdStore.get("session_token");
        if (savedTokenBytes) {
          const savedToken = new TextDecoder().decode(savedTokenBytes);
          try {
            // Re-hydrate the Clerk session using the saved ticket/token
            await clerkInstance.setActive({ session: savedToken });
          } catch (e) {
            console.error("Failed to hydrate saved session:", e);
            await strongholdStore.remove("session_token");
            await stronghold.save();
          }
        }

        // 3. Enforce Client-Side Protection
        if (!clerkInstance.session && !pathname.includes("/desktop-login")) {
          // No valid session, redirect to the native login gateway
          router.replace("/en/desktop-login");
        } else {
          setIsReady(true);
        }

        // 4. Listen for OS Deep Links (oauth_callback)
        unlisten = await listen<string>("oauth_callback", async (event: { payload: string }) => {
          const url = event.payload;
          console.log("Intercepted OAuth Callback Deep Link:", url);
          
          try {
            // Parse the deep link: latticeos://auth?ticket=...
            const parsedUrl = new URL(url);
            const ticket = parsedUrl.searchParams.get("ticket") || parsedUrl.searchParams.get("token");

            if (ticket && clerkInstance) {
              // Exchange the ticket for a session
              const res = await clerkInstance.setActive({ session: ticket });
              console.log("Clerk Session Activated");

              // Save to encrypted Stronghold store
              if (strongholdStore) {
                const ticketBytes = Array.from(new TextEncoder().encode(ticket));
                await strongholdStore.insert("session_token", ticketBytes);
                await stronghold.save();
              }
              
              setIsReady(true);
              router.replace("/en"); // Redirect to dashboard
            }
          } catch (e) {
            console.error("Failed to process OAuth callback:", e);
          }
        });

      } catch (err) {
        console.error("Desktop Auth Initialization Failed:", err);
        setIsReady(true);
      }
    };

    initDesktopAuth();

    return () => {
      if (unlisten) unlisten();
    };
  }, [isDesktop, pathname, router]);

  if (!isReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Booting Lattice Engine...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
