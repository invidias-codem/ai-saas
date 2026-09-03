"use client";

// CreditsSection no longer fetches post-mount; the server page bakes the
// credit balance in as a prop. (useCredits/SWR remains for surfaces that
// need live 30s polling — Commit B can wire that back if desired.)
import { Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function CreditsSection({ initialCredits }: { initialCredits: number }) {
  const paypalUrl =
    process.env.NEXT_PUBLIC_PAYPAL_DONATION_URL ||
    "https://ko-fi.com/joshuajair/?hidefeed=true&widget=true&embed=true&preview=true";

  return (
    <Card className="p-6 border-black/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-500/10">
            <Zap className="w-6 h-6 text-yellow-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Credits</h3>
            <p className="text-sm text-muted-foreground">
              {initialCredits.toLocaleString()} compute credits available
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Credits power agent runs, model calls, and background workers.
            </p>
          </div>
        </div>
        <Button asChild className="bg-yellow-500 hover:bg-yellow-600 text-black">
          <a href={paypalUrl} target="_blank" rel="noopener noreferrer">
            Top Up via PayPal
          </a>
        </Button>
      </div>
    </Card>
  );
}
