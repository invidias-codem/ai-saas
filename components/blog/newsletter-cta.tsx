"use client";

import { useState } from "react";
import { Mail, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NewsletterCTAProps {
  title?: string;
  description?: string;
  variant?: "default" | "compact" | "inline";
}

export function NewsletterCTA({
  title = "Get AI Tips in Your Inbox",
  description = "Join 5,000+ creators and developers getting weekly AI insights, prompts, and tutorials.",
  variant = "default",
}: NewsletterCTAProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    }
  };

  if (variant === "compact") {
    return (
      <div className="my-8 p-6 rounded-xl border border-border bg-chrome">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
          
          {status === "success" ? (
            <div className="flex items-center gap-2 text-primary">
              <Check className="w-5 h-5" />
              <span>Subscribed!</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
              <Input
                type="email"
                aria-label="Email address"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 min-w-0 flex-1 bg-card sm:w-40"
                required
              />
              <Button
                type="submit"
                disabled={status === "loading"}
                variant="action"
                className="h-11 whitespace-nowrap"
              >
                {status === "loading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Subscribe"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="my-6 p-4 rounded-lg border border-border bg-card shadow-sm dark:shadow-none">
        {status === "success" ? (
          <div className="flex items-center justify-center gap-2 text-primary py-2">
            <Check className="w-5 h-5" />
            <span>Thanks for subscribing!</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              aria-label="Email address"
              placeholder="Get updates in your inbox"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 min-w-0 flex-1 bg-card"
              required
            />
            <Button
              type="submit"
              disabled={status === "loading"}
              size="sm"
              variant="action"
              className="h-11"
            >
              {status === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Subscribe
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="my-12 p-5 sm:p-8 rounded-2xl border border-border bg-chrome">
      
      <div className="text-center max-w-xl mx-auto">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent mb-4">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        
        <h3 className="text-2xl font-bold text-foreground mb-2">{title}</h3>
        <p className="text-muted-foreground mb-6">{description}</p>

        {status === "success" ? (
          <div className="flex items-center justify-center gap-2 text-primary py-4">
            <Check className="w-6 h-6" />
            <span className="text-lg font-medium">You&apos;re subscribed! Check your inbox.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              aria-label="Email address"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 min-w-0 flex-1 bg-card text-base"
              required
            />
            <Button
              type="submit"
              disabled={status === "loading"}
              variant="action"
              className="h-12 px-6 text-base font-semibold"
            >
              {status === "loading" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Mail className="w-5 h-5 mr-2" />
                  Subscribe Free
                </>
              )}
            </Button>
          </form>
        )}

        {status === "error" && (
          <p className="mt-3 text-destructive text-sm">
            Something went wrong. Please try again.
          </p>
        )}

        <p className="mt-4 text-muted-foreground text-xs">
          No spam, ever. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
