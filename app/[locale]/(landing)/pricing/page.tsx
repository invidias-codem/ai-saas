"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";

const plans = [
  {
    key: "standardOS",
    popular: false,
    href: "/onboarding",
    checkout: false,
  },
  {
    key: "theExpert",
    popular: true,
    href: "/onboarding",
    checkout: true,
  },
  {
    key: "enterprise",
    popular: false,
    href: "/support",
    checkout: false,
  },
] as const;

export default function PricingPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(168,85,247,0.08),transparent_60%)] pointer-events-none" />

      <div className="relative z-10">
        <header className="border-b border-border/60 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-purple-500 to-pink-600" />
              <span className="text-lg font-bold tracking-tight font-heading">Lattice OS</span>
            </Link>
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
              <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
              <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
            </nav>
            <Link href="/onboarding">
              <Button className="rounded-full px-6 py-2 text-sm font-semibold">
                Start 7-Day Trial
              </Button>
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-7xl px-6 pt-24 pb-20 md:pt-32 md:pb-28">
          <div className="max-w-3xl mx-auto text-center mb-16 animate-fade-in">
            <span className="inline-block rounded-full border border-purple-500/30 bg-purple-500/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-purple-300 mb-8">
              Intelligence as a Service
            </span>
            <h1 className="font-heading font-bold tracking-tight leading-[1.05] mb-6" style={{ fontSize: 'clamp(2.6rem, 6vw, 4.6rem)' }}>
              Rent a specialized consultant.
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl leading-relaxed max-w-2xl mx-auto">
              Stop paying by the token. Rent a customized, data-backed expert designed to compound your workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan, idx) => (
              <PricingCard key={plan.key} plan={plan} index={idx} />
            ))}
          </div>

          <p className="text-xs text-center text-muted-foreground mt-12">
            Prices reflect the consultant rental model. Credits are no longer the primary billing unit for expert tiers.
          </p>
        </section>

        <footer className="border-t border-border py-8">
          <div className="mx-auto max-w-7xl px-6 flex items-center justify-between text-xs text-muted-foreground">
            <span>&copy; {new Date().getFullYear()} Lattice OS. All rights reserved.</span>
            <span>Intelligence as a Service</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function PricingCard({ plan, index }: { plan: typeof plans[number]; index: number }) {
  const isExpert = plan.key === "theExpert";
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const content = {
    standardOS: {
      name: "Standard OS",
      price: "$0",
      unit: "forever free",
      subtitle: "For individuals moving beyond generic chat wrappers.",
      cta: "Start Building",
      features: [
        "Multi-model chat interface (Gemini, Claude, DeepSeek)",
        "Basic persistent conversation memory",
        "Standard workspace source ingestion (PDFs, URLs, text)",
        "Access to the standard Weaver base persona",
      ],
    },
    theExpert: {
      name: "The Expert",
      price: "$49",
      unit: "per month or $100/year",
      subtitle: "For operators, founders, and agencies who need on-demand, hyper-specialized domain consulting.",
      cta: "Rent Your Consultant",
      features: [
        "The Chameleon Engine: dynamic persona synthesis tailored to your exact workspace constraints",
        "Data Refinery access for continuously updated, temporal market intelligence",
        "UCOL debate loops: full Code Builder and multi-agent reasoning",
        "Priority orchestration: uncapped, zero-latency routing to the optimal LLM",
      ],
    },
    enterprise: {
      name: "Enterprise",
      price: "Custom",
      unit: "license & deployment",
      subtitle: "For organizations integrating the Unified Context Orchestration Layer across their data.",
      cta: "Contact Sales",
      features: [
        "Shared workspace knowledge graphs with role-based access control",
        "Custom Data Refinery scraping targets for your specific niche",
        "Dedicated Relay orchestration agents for internal workflows",
        "SOC2 & GDPR compliant data export and deletion",
      ],
    },
  };

  const data = content[plan.key];

  const handleExpertCheckout = async () => {
    if (!isLoaded) return;

    if (!user) {
      router.push("/sign-up?redirectUrl=/pricing");
      return;
    }

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        console.error("Failed to create checkout session:", result);
        alert(result.error || "Failed to start checkout. Please try again.");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout. Please try again.");
    }
  };

  return (
    <div
      className={`relative rounded-2xl border p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
        plan.popular
          ? "border-purple-500 bg-gradient-to-br from-purple-500/5 to-pink-500/5 shadow-[0_0_35px_-8px_rgba(168,85,247,0.35)]"
          : "border-border bg-card"
      }`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold">
          Recommended
        </div>
      )}

      <div className="text-center mb-6">
        <h3 className="text-lg font-bold text-foreground mb-2">{data.name}</h3>
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400">
            {data.price}
          </span>
          <span className="text-sm text-muted-foreground">{data.unit}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">{data.subtitle}</p>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {data.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
            <CheckIcon className="w-4 h-4 text-purple-500 dark:text-purple-400 mt-0.5 flex-shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {plan.checkout ? (
        <Button
          className={`w-full rounded-xl font-semibold ${
            plan.popular
              ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:opacity-90"
              : ""
          }`}
          onClick={handleExpertCheckout}
        >
          {data.cta}
        </Button>
      ) : (
        <Link href={plan.href}>
          <Button
            className={`w-full rounded-xl font-semibold ${
              plan.popular
                ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:opacity-90"
                : ""
            }`}
          >
            {data.cta}
          </Button>
        </Link>
      )}
    </div>
  );
}
