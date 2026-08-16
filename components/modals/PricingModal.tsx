"use client";

import { useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { usePricingModal } from "@/lib/store/pricing-modal-store";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    key: "standardOS",
    name: "Standard OS",
    price: "$0",
    unit: "forever free",
    subtitle: "For individuals moving beyond generic chat wrappers.",
    cta: "Start Building",
    popular: false,
    checkout: false,
    href: "/onboarding",
    features: [
      "Multi-model chat interface (Gemini, Claude, DeepSeek)",
      "Basic persistent conversation memory",
      "Standard workspace source ingestion (PDFs, URLs, text)",
      "Access to the standard Weaver base persona",
    ],
  },
  {
    key: "theExpert",
    name: "The Expert",
    price: "$49",
    unit: "per month or $100/year",
    subtitle: "For operators, founders, and agencies who need on-demand, hyper-specialized domain consulting.",
    cta: "Rent Your Consultant",
    popular: true,
    checkout: true,
    href: "#",
    features: [
      "The Chameleon Engine: dynamic persona synthesis tailored to your exact workspace constraints",
      "Data Refinery access for continuously updated, temporal market intelligence",
      "UCOL debate loops: full Code Builder and multi-agent reasoning",
      "Priority orchestration: uncapped, zero-latency routing to the optimal LLM",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    unit: "license & deployment",
    subtitle: "For organizations integrating the Unified Context Orchestration Layer across their data.",
    cta: "Contact Sales",
    popular: false,
    checkout: false,
    href: "/support",
    features: [
      "Shared workspace knowledge graphs with role-based access control",
      "Custom Data Refinery scraping targets for your specific niche",
      "Dedicated Relay orchestration agents for internal workflows",
      "SOC2 & GDPR compliant data export and deletion",
    ],
  },
] as const;

export function PricingCards({ layout = "grid" }: { layout?: "grid" | "inline" }) {
  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openModal, close: closeModal } = usePricingModal();

  const handleCheckout = useCallback(async () => {
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (result.url) {
        closeModal();
        window.location.href = result.url;
      } else {
        console.error("Failed to create checkout session:", result);
        alert(result.error || "Failed to start checkout. Please try again.");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout. Please try again.");
    }
  }, [closeModal]);

  // After auth redirect: if plan is in URL and user is authenticated, trigger checkout
  useEffect(() => {
    const plan = searchParams.get("plan");
    if (plan && userId && isLoaded && plan === "theExpert") {
      const url = new URL(window.location.href);
      url.searchParams.delete("plan");
      window.history.replaceState(null, "", url.toString());
      handleCheckout();
    }
  }, [searchParams, userId, isLoaded, handleCheckout]);

  const handleTierClick = useCallback(
    async (tier: typeof TIERS[number]) => {
      if (!isLoaded) return;

      if (tier.checkout) {
        if (userId) {
          await handleCheckout();
        } else {
          const returnPath = encodeURIComponent(`/pricing?plan=${tier.key}`);
          router.push(`/sign-up?redirectUrl=${returnPath}`);
        }
      } else {
        closeModal();
        router.push(tier.href);
      }
    },
    [userId, isLoaded, router, closeModal, handleCheckout]
  );

  return (
    <div
      className={cn(
        layout === "grid"
          ? "grid grid-cols-1 md:grid-cols-3 gap-6"
          : "flex flex-col gap-6"
      )}
    >
      {TIERS.map((tier, idx) => (
        <div
          key={tier.key}
          className={cn(
            "relative rounded-2xl border p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
            tier.popular
              ? "border-purple-500 bg-gradient-to-br from-purple-500/5 to-pink-500/5 shadow-[0_0_35px_-8px_rgba(168,85,247,0.35)]"
              : "border-border bg-card"
          )}
          style={{ animationDelay: `${idx * 100}ms` }}
        >
          {tier.popular && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold">
              Recommended
            </div>
          )}

          <div className="text-center mb-6">
            <h3 className="text-lg font-bold text-foreground mb-2">{tier.name}</h3>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400">
                {tier.price}
              </span>
              <span className="text-sm text-muted-foreground">{tier.unit}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{tier.subtitle}</p>
          </div>

          <ul className="space-y-3 mb-8 flex-1">
            {tier.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckIcon className="w-4 h-4 text-purple-500 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <Button
            className={cn(
              "w-full rounded-xl font-semibold",
              tier.popular
                ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:opacity-90"
                : ""
            )}
            onClick={() => handleTierClick(tier)}
          >
            {tier.cta}
          </Button>
        </div>
      ))}
    </div>
  );
}

export function PricingModal() {
  const { close, isOpen } = usePricingModal();

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 border-border bg-background">
        <div className="p-8 md:p-12">
          <div className="text-center mb-10">
            <span className="inline-block rounded-full border border-purple-500/30 bg-purple-500/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-purple-300 mb-4">
              Intelligence as a Service
            </span>
            <h2 className="font-heading font-bold tracking-tight text-3xl md:text-4xl mb-3">
              Choose your consultant tier
            </h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              Start free. Upgrade when you need a hyper-specialized, data-backed expert on demand.
            </p>
          </div>

          <PricingCards />

          <p className="text-xs text-center text-muted-foreground mt-10">
            Prices reflect the consultant rental model. Credits are no longer the primary billing unit for expert tiers.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
