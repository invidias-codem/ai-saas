// components/explore/PaywallPage.tsx
// Reusable server component: enforces auth + plan, or renders the paywall.
"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowRight, Lock, Sparkles } from "lucide-react";

interface PaywallPageProps {
    featureName: string;
    children: React.ReactNode;
}

export function PaywallPage({ featureName, children }: PaywallPageProps) {
    const [hasPlan, setHasPlan] = useState(false);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        let cancelled = false;

        async function check() {
            try {
                const res = await fetch("/api/plan/check", { cache: "no-store" });
                if (!res.ok) throw new Error("plan check failed");
                const data = (await res.json()) as { hasPlan: boolean };
                if (!cancelled) setHasPlan(data.hasPlan);
            } catch {
                if (!cancelled) setHasPlan(false);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        check();

        return () => {
            cancelled = true;
        };
    }, [router, pathname]);

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
            </div>
        );
    }

    if (!hasPlan) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4">
                <div className="flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-200">
                    <Lock className="h-3.5 w-3.5" />
                    Premium extension
                </div>
                <h2 className="text-2xl font-bold tracking-tight">
                    {featureName} is part of the high-compute extensions
                </h2>
                <p className="max-w-md text-center text-sm text-muted-foreground">
                    {featureName} is reserved for workspace intelligence subscribers.
                    Sign in and activate your subscription to unlock it.
                </p>
                <button
                    onClick={() =>
                        router.push(
                            `/sign-up?redirect_url=${encodeURIComponent(pathname)}`
                        )
                    }
                    className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700"
                >
                    Unlock with workspace intelligence <ArrowRight className="h-4 w-4" />
                </button>
            </div>
        );
    }

    return <>{children}</>;
}
