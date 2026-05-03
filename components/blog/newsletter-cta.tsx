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
      <div className="my-8 p-6 rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{title}</h3>
            <p className="text-slate-600 dark:text-gray-400 text-sm">{description}</p>
          </div>
          
          {status === "success" ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="w-5 h-5" />
              <span>Subscribed!</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2 w-full sm:w-auto">
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 w-full sm:w-48"
                required
              />
              <Button
                type="submit"
                disabled={status === "loading"}
                className="bg-purple-600 hover:bg-purple-700 text-white whitespace-nowrap"
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
      <div className="my-6 p-4 rounded-lg border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-white/5 shadow-sm dark:shadow-none">
        {status === "success" ? (
          <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400 py-2">
            <Check className="w-5 h-5" />
            <span>Thanks for subscribing!</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              placeholder="Get updates in your inbox"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 flex-1"
              required
            />
            <Button
              type="submit"
              disabled={status === "loading"}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
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
    <div className="my-12 p-8 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-blue-500/10 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative z-10 text-center max-w-xl mx-auto">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/20 mb-4">
          <Sparkles className="w-6 h-6 text-purple-500 dark:text-purple-400" />
        </div>
        
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
        <p className="text-slate-600 dark:text-gray-400 mb-6">{description}</p>

        {status === "success" ? (
          <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400 py-4">
            <Check className="w-6 h-6" />
            <span className="text-lg font-medium">You&apos;re subscribed! Check your inbox.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 h-12 text-base flex-1"
              required
            />
            <Button
              type="submit"
              disabled={status === "loading"}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white h-12 px-6 text-base font-semibold"
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
          <p className="mt-3 text-red-600 dark:text-red-400 text-sm">
            Something went wrong. Please try again.
          </p>
        )}

        <p className="mt-4 text-slate-500 dark:text-gray-500 text-xs">
          No spam, ever. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
