"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Turnstile } from "@marsidev/react-turnstile";
import { ArrowRightIcon, PaperPlaneIcon, LockClosedIcon } from "@radix-ui/react-icons";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const messageVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.2, ease: EASE_OUT },
  },
};

const panelVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: 4,
    transition: { duration: 0.2, ease: EASE_OUT },
  },
};

const FREE_LIMIT = 10;
const SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";

interface GuestMessage {
  role: "user" | "bot";
  text: string;
}

const GREETING: GuestMessage = {
  role: "bot",
  text: "Hey! I'm Weaver, the intelligence inside Lattice OS. Ask me anything — I'll show you what memory-native AI feels like.",
};

const SUGGESTED_PROMPTS = [
  "What makes Lattice OS different from ChatGPT?",
  "Explain memory-native AI in one paragraph.",
  "Help me plan a weekend project.",
];

export const GuestChat = () => {
  const [messages, setMessages] = useState<GuestMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [interactionCount, setInteractionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [guestSessionId] = useState<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const remaining = Math.max(0, FREE_LIMIT - interactionCount);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || loading || limitReached) return;

      setError(null);
      const nextMessages: GuestMessage[] = [
        ...messages,
        { role: "user", text },
      ];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/guest-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages
              .filter((m) => m !== GREETING)
              .map((m) => ({ role: m.role, text: m.text })),
            interactionCount,
            turnstileToken: turnstileToken ?? undefined,
            guestSessionId: guestSessionId,
          }),
        });

        const data = await res.json();

        if (res.status === 403 && data.requiresSignup) {
          setLimitReached(true);
          setMessages((prev) => [
            ...prev,
            {
              role: "bot",
              text:
                data.message ||
                "You've used all your free messages! Sign up to keep working with Weaver.",
            },
          ]);
          return;
        }

        if (res.status === 429) {
          setError("Too many requests right now. Give it a moment and try again.");
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || data.message || "Something went wrong.");
        }

        setInteractionCount((c) => c + 1);
        setMessages((prev) => [...prev, { role: "bot", text: data.text }]);

        if (typeof data.remainingMessages === "number" && data.remainingMessages <= 0) {
          setLimitReached(true);
        }
      } catch (err: any) {
        setError(err.message || "Weaver is unavailable right now. Please try again.");
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
      } finally {
        setLoading(false);
      }
    },
    [messages, interactionCount, turnstileToken, loading, limitReached, guestSessionId]
  );

  return (
    <div className="relative w-full max-w-lg rounded-2xl border border-border/60 bg-background/60 p-4 sm:p-6 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      {/* Header */}
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">Try Weaver free</p>
            <p className="text-[11px] text-muted-foreground">No signup. No credit card.</p>
          </div>
        </div>
        {!limitReached && (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            {remaining} free {remaining === 1 ? "message" : "messages"} left
          </span>
        )}
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="relative h-[260px] overflow-y-auto rounded-xl bg-background/40 p-3 space-y-3 scroll-smooth"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={`${msg.role}-${i}`}
              variants={messageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                )}
              >
                {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            variants={messageVariants}
            initial="hidden"
            animate="visible"
            className="flex justify-start"
          >
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5">
              <motion.span
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 0.55, repeat: Infinity, ease: EASE_OUT }}
                className="h-2 w-2 rounded-full bg-indigo-400"
              />
              <motion.span
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 0.55, delay: 0.08, repeat: Infinity, ease: EASE_OUT }}
                className="h-2 w-2 rounded-full bg-purple-400"
              />
              <motion.span
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 0.55, delay: 0.16, repeat: Infinity, ease: EASE_OUT }}
                className="h-2 w-2 rounded-full bg-sky-400"
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* Suggested prompts (only before first user message) */}
      {messages.length === 1 && !loading && (
        <div className="relative mt-3 flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
              className="rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:border-primary/50 hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="relative mt-2 text-xs text-destructive">{error}</p>
      )}

      {/* Input or upsell */}
      <div className="relative mt-3">
        <AnimatePresence mode="wait">
          {limitReached ? (
            <motion.div
              key="upsell"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="rounded-xl border border-primary/30 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-4 text-center"
            >
              <LockClosedIcon className="mx-auto mb-2 h-5 w-5 text-primary" />
              <p className="mb-3 text-sm font-medium text-foreground">
                Liked that? Sign up to unlock persistent memory, code, and more.
              </p>
              <Link href="/dashboard">
                <Button className="w-full rounded-full font-semibold">
                  Continue in Lattice OS
                  <ArrowRightIcon className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          ) : (
            <motion.form
              key="input"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="flex items-center gap-2 rounded-full border border-border/60 bg-background/60 p-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                placeholder="Ask Weaver anything…"
                className="flex-1 bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground/70 disabled:opacity-50"
                aria-label="Message Weaver"
              />
              <Button
                type="submit"
                disabled={loading || !input.trim()}
                className="h-8 w-8 rounded-full bg-indigo-600 p-0 hover:bg-indigo-700 disabled:opacity-40"
                aria-label="Send message"
              >
                <PaperPlaneIcon className="h-4 w-4" />
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      {/* Invisible Turnstile — feeds the server-side verification in /api/guest-chat */}
      <div className="mt-2 flex justify-center">
        <Turnstile
          siteKey={SITE_KEY}
          options={{ size: "invisible", theme: "auto" }}
          onSuccess={(token) => setTurnstileToken(token)}
          onError={() => setTurnstileToken(null)}
          onExpire={() => setTurnstileToken(null)}
        />
      </div>
    </div>
  );
};

export default GuestChat;
