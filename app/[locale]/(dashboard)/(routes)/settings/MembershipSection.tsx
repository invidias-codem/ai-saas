"use client";

import { useState } from "react";
import { Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  initialPlan: "free" | "pro";
  initialPremiumUntil: string | null;
}

export function MembershipSection({ initialPlan, initialPremiumUntil }: Props) {
  const [plan, setPlan] = useState<"free" | "pro">(initialPlan);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(initialPremiumUntil);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimSuccess, setClaimSuccess] = useState("");

  async function handleClaim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClaimError("");
    setClaimSuccess("");
    setClaiming(true);

    const form = e.currentTarget;
    const transactionId = (form.elements.namedItem("transactionId") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("kofiEmail") as HTMLInputElement).value.trim();

    try {
      const res = await fetch("/api/settings/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: transactionId, email }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string; premium_until?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error || "Claim failed");
      }

      setPlan("pro");
      if (data.premium_until) setPremiumUntil(data.premium_until);
      setClaimSuccess("Premium activated! Enjoy the full platform.");
      form.reset();
    } catch (err: any) {
      setClaimError(err.message || "Something went wrong. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Card className="p-6 border-black/5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-purple-500/10">
          <Crown className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Membership</h3>
          <p className="text-sm text-muted-foreground">
            {plan === "pro"
              ? `Premium active${premiumUntil ? ` until ${new Date(premiumUntil).toLocaleDateString()}` : ""}`
              : "Free tier — upgrade to unlock high-compute extensions"}
          </p>
        </div>
      </div>

      {/* Manual claim fallback (always visible as a self-serve escape hatch) */}
      <form onSubmit={handleClaim} className="mt-5 space-y-3">
        <p className="text-xs text-muted-foreground">
          If you donated on Ko-fi but your account email differs from the Clerk email on this
          device, submit your Ko-fi transaction ID and buyer email here to manually claim
          premium access.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            name="transactionId"
            placeholder="Ko-fi Transaction ID"
            required
            className="sm:max-w-[260px]"
          />
          <Input
            name="kofiEmail"
            type="email"
            placeholder="Ko-fi buyer email"
            required
            className="sm:max-w-[260px]"
          />
          <Button
            type="submit"
            disabled={claiming}
            className="bg-purple-600 hover:bg-purple-700 whitespace-nowrap"
          >
            {claiming ? "Verifying…" : "Claim Premium"}
          </Button>
        </div>
        {claimError && <p className="text-xs text-red-600">{claimError}</p>}
        {claimSuccess && <p className="text-xs text-emerald-600">{claimSuccess}</p>}
      </form>
    </Card>
  );
}
