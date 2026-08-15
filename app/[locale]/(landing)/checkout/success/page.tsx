"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const REDIRECT_SECONDS = 10;

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      router.push("/onboarding");
      return;
    }
    const interval = setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft, router]);

  return (
    <div className="relative min-h-screen bg-background text-foreground flex items-center justify-center px-6 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(168,85,247,0.06),transparent_65%)] pointer-events-none" />

      <div className="relative z-10 w-full max-w-xl text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-8">
          <CheckIcon className="w-10 h-10 text-emerald-500" />
        </div>

        <h1 className="font-heading font-bold tracking-tight leading-[1.05] mb-4" style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
          Your consultant is ready.
        </h1>

        <p className="text-muted-foreground text-lg leading-relaxed max-w-md mx-auto mb-10">
          Payment confirmed. Your account is upgraded to Expert.
          Let&apos;s build your first workspace — tell us your domain, and we&apos;ll spin up a hyper-specialized consultant pre-loaded with your context.
        </p>

        <div className="flex flex-col items-center gap-6">
          <Link href="/onboarding">
            <Button size="lg" className="bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:opacity-90 rounded-full px-8 py-6 text-base font-semibold">
              Start Building
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Button>
          </Link>

          <p className="text-xs text-muted-foreground">
            Redirecting automatically in {secondsLeft}s...
          </p>
        </div>
      </div>
    </div>
  );
}
