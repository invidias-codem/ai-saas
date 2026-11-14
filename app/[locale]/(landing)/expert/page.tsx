"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useDispatch } from "@/hooks/useDispatch";
import { Button, buttonVariants } from "@/components/ui/button";
import { BorderlineBanner } from "@/components/BorderlineBanner";
import { HardBlockTerminal } from "@/components/HardBlockTerminal";

export default function ExpertPage() {
  const t = useTranslations("Landing.expert");
  const tCta = useTranslations("Landing.expert.cta");
  const tMechanics = useTranslations("Landing.expert.mechanics");
  const tWorkflow = useTranslations("Landing.expertV2.workflow");

  const [prompt, setPrompt] = useState("");
  const {
    state,
    envelope,
    dispatch,
    elevatedRetry,
    reset,
    isLoading,
    error,
  } = useDispatch();

  const canSubmit = state === "IDLE" && prompt.trim().length > 0;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    dispatch({
      taskType: "CLINICAL_ADVICE",
      prompt: prompt.trim(),
      candidateOutput: prompt.trim(),
      contextTokens: 1000,
      sessionId: crypto.randomUUID(),
    });
  };

  const handleElevatedRetry = async (nonce: string) => {
    await elevatedRetry(nonce, prompt.trim());
  };

  const handleDismiss = () => {
    reset();
    setPrompt("");
  };

  return (
    <main className="min-h-screen bg-chrome">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="bg-chrome relative overflow-hidden px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <span className="bg-accent text-accent-foreground mb-6 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t("badge")}
          </span>
          <h1
            className="text-foreground mb-6 font-heading font-bold tracking-tight"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            {t("headline1")}
            <br />
            {t("headline2")}
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg leading-relaxed md:text-xl">
            {t("subhead")}
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <button
              onClick={() => document.getElementById("consultation-form")?.scrollIntoView({ behavior: "smooth" })}
              className={buttonVariants({ variant: "action", className: "h-12 rounded-full px-6" })}
              style={{ minHeight: 48 }}
            >
              {tCta("ctaFooterPrimary")}
            </button>
            <button
              onClick={() => document.getElementById("mechanics")?.scrollIntoView({ behavior: "smooth" })}
              className={buttonVariants({ variant: "outline", className: "h-12 rounded-full px-6" })}
              style={{ minHeight: 48 }}
            >
              {t("ctaSecondary")}
            </button>
          </div>
        </div>
      </section>

      {/* ── Mechanics ─────────────────────────────────────────────── */}
      <section id="mechanics" className="scroll-mt-16 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="bg-accent text-accent-foreground mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
              {tMechanics("eyebrow")}
            </span>
            <h2 className="text-foreground mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              {tMechanics("title")}
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
              {tMechanics("subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                key: "item1Title",
                bodyKey: "item1Body",
                icon: "🔒",
              },
              {
                key: "item2Title",
                bodyKey: "item2Body",
                icon: "⚗️",
              },
              {
                key: "item3Title",
                bodyKey: "item3Body",
                icon: "🔍",
              },
              {
                key: "item4Title",
                bodyKey: "item4Body",
                icon: "🎯",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="border border-border bg-card rounded-2xl p-6 transition-colors hover:border-primary"
              >
                <div className="mb-4 text-2xl">{item.icon}</div>
                <h3 className="text-foreground mb-2 text-lg font-semibold">
                  {tMechanics(item.key)}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {tMechanics(item.bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Consultation Form + Workflow Demo ─────────────────────── */}
      <section id="consultation-form" className="scroll-mt-16 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <span className="bg-accent text-accent-foreground mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
              {t("formEyebrow", { defaultValue: "Consultation" })}
            </span>
            <h2 className="text-foreground mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              {tCta("title")}
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
              {tCta("subtitle")}
            </p>
          </div>

          <div className="border border-border bg-card rounded-2xl p-6 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="prompt"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  {tWorkflow("step2Title")}
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  disabled={state === "LOADING" || state === "BORDERLINE_UI"}
                  className="block w-full rounded-md border border-input bg-background p-4 text-base text-foreground placeholder:text-muted-foreground disabled:opacity-50"
                  placeholder={tWorkflow("prompt")}
                  style={{ minHeight: 120 }}
                />
              </div>

              <Button type="submit" variant="action" disabled={!canSubmit} className="h-12 rounded-full px-6">
                {isLoading
                  ? t("processing", { defaultValue: "Processing..." })
                  : tCta("ctaFooterPrimary")}
              </Button>
            </form>

            {/* ── Response Output ─────────────────────────────────── */}
            {state === "DISPATCHED" && envelope?.response && (
              <div className="mt-10">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-foreground text-lg font-semibold">
                    {t("responseTitle", { defaultValue: "Consultation Output" })}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {envelope.router && (
                      <>
                        <span>Tier: {envelope.router.tier}</span>
                        <span>Provider: {envelope.router.provider}</span>
                        <span>Model: {envelope.router.model}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-chrome p-6">
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                    {envelope.response}
                  </p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={handleDismiss}
                    className="text-xs text-muted-foreground underline hover:text-primary"
                  >
                    {t("newQuery", { defaultValue: "New query" })}
                  </button>
                </div>
              </div>
            )}

            {/* ── Error State ──────────────────────────────────────── */}
            {error && (
              <div className="mt-6 rounded-lg border border-destructive/30 bg-danger-surface p-4">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Workflow Demo (Static) ─────────────────────────────────── */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="bg-accent text-accent-foreground mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
              {tWorkflow("eyebrow")}
            </span>
            <h2 className="text-foreground mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              {tWorkflow("title")}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Static demo block */}
            <div className="border border-border bg-card rounded-2xl p-6 md:p-8">
              <h3 className="text-foreground mb-4 text-lg font-semibold">
                {tWorkflow("step2Title")}
              </h3>
              <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
                {tWorkflow("step2Desc")}
              </p>
              <div className="rounded-md border border-border bg-chrome p-4">
                <p className="font-mono text-xs text-muted-foreground">
                  &quot;{tWorkflow("prompt")}&quot;
                </p>
              </div>
            </div>

            <div className="border border-border bg-card rounded-2xl p-6 md:p-8">
              <h3 className="text-foreground mb-4 text-lg font-semibold">
                {tWorkflow("step3Title")}
              </h3>
              <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
                {tWorkflow("step3Desc")}
              </p>
              <div className="rounded-md border border-border bg-chrome p-4">
                <p className="text-xs text-muted-foreground">
                  {t("workflowDemoPlaceholder", {
                    defaultValue: "Submit a consultation above to see grounded reasoning here.",
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Conditional Overlays ─────────────────────────────────── */}
      {state === "BORDERLINE_UI" && envelope && (
        <BorderlineBanner
          response={envelope}
          onElevatedRetry={handleElevatedRetry}
          onDismiss={handleDismiss}
          isRetrying={isLoading}
        />
      )}

      {state === "HARD_BLOCK_TERMINAL" && envelope && (
        <HardBlockTerminal
          nonce={envelope.auditNonce}
          reason={
            envelope.causalViolations[0]?.driftDescription ??
            envelope.terminalReason ??
            "Session halted"
          }
          onDismiss={handleDismiss}
        />
      )}
    </main>
  );
}
