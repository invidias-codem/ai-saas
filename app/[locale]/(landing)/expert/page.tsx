"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useDispatch } from "@/hooks/useDispatch";
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
    <main className="min-h-screen landing-bg-muted">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="landing-bg-muted relative overflow-hidden px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <span className="landing-badge-primary mb-6 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t("badge")}
          </span>
          <h1
            className="landing-text-primary mb-6 font-heading font-bold tracking-tight"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            {t("headline1")}
            <br />
            {t("headline2")}
          </h1>
          <p className="landing-text-secondary mx-auto max-w-2xl text-lg leading-relaxed md:text-xl">
            {t("subhead")}
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <button
              onClick={() => document.getElementById("consultation-form")?.scrollIntoView({ behavior: "smooth" })}
              className="landing-cta-primary inline-flex h-12 items-center justify-center px-8 text-sm font-medium transition-opacity hover:opacity-95"
              style={{ minHeight: 48 }}
            >
              {tCta("ctaFooterPrimary")}
            </button>
            <button
              onClick={() => document.getElementById("mechanics")?.scrollIntoView({ behavior: "smooth" })}
              className="landing-cta-secondary inline-flex h-12 items-center justify-center px-8 text-sm font-medium"
              style={{ minHeight: 48 }}
            >
              {t("ctaSecondary")}
            </button>
          </div>
        </div>
      </section>

      {/* ── Mechanics ─────────────────────────────────────────────── */}
      <section id="mechanics" className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="landing-badge-secondary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
              {tMechanics("eyebrow")}
            </span>
            <h2 className="landing-text-primary mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              {tMechanics("title")}
            </h2>
            <p className="landing-text-secondary mx-auto max-w-2xl text-lg">
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
                className="landing-card-strong rounded-2xl p-6 transition-colors hover:border-primary-500/30"
              >
                <div className="mb-4 text-2xl">{item.icon}</div>
                <h3 className="landing-text-primary mb-2 text-lg font-semibold">
                  {tMechanics(item.key)}
                </h3>
                <p className="landing-text-secondary text-sm leading-relaxed">
                  {tMechanics(item.bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Consultation Form + Workflow Demo ─────────────────────── */}
      <section id="consultation-form" className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <span className="landing-badge-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
              {t("formEyebrow", { defaultValue: "Consultation" })}
            </span>
            <h2 className="landing-text-primary mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              {tCta("title")}
            </h2>
            <p className="landing-text-secondary mx-auto max-w-2xl text-lg">
              {tCta("subtitle")}
            </p>
          </div>

          <div className="landing-card-strong rounded-2xl p-6 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="prompt"
                  className="mb-2 block text-sm font-medium landing-text-primary"
                >
                  {tWorkflow("step2Title")}
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  disabled={state === "LOADING" || state === "BORDERLINE_UI"}
                  className="block w-full rounded-md border border-neutral-700 bg-black/60 p-4 text-sm text-white placeholder:text-neutral-500 focus:border-primary-500 focus:outline-none disabled:opacity-50"
                  placeholder={tWorkflow("prompt")}
                  style={{ minHeight: 120 }}
                />
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="landing-cta-primary inline-flex h-12 items-center justify-center px-10 text-sm font-medium transition-opacity hover:opacity-95 disabled:opacity-50"
                style={{ minHeight: 48, minWidth: 160 }}
              >
                {isLoading
                  ? t("processing", { defaultValue: "Processing..." })
                  : tCta("ctaFooterPrimary")}
              </button>
            </form>

            {/* ── Response Output ─────────────────────────────────── */}
            {state === "DISPATCHED" && envelope?.response && (
              <div className="mt-10">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="landing-text-primary text-lg font-semibold">
                    {t("responseTitle", { defaultValue: "Consultation Output" })}
                  </h3>
                  <div className="flex items-center gap-3 text-xs landing-text-muted">
                    {envelope.router && (
                      <>
                        <span>Tier: {envelope.router.tier}</span>
                        <span>Provider: {envelope.router.provider}</span>
                        <span>Model: {envelope.router.model}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-black/60 p-6">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                    {envelope.response}
                  </p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={handleDismiss}
                    className="text-xs landing-text-muted underline hover:text-white"
                  >
                    {t("newQuery", { defaultValue: "New query" })}
                  </button>
                </div>
              </div>
            )}

            {/* ── Error State ──────────────────────────────────────── */}
            {error && (
              <div className="mt-6 rounded-lg border border-red-900/50 bg-red-950/20 p-4">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Workflow Demo (Static) ─────────────────────────────────── */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="landing-badge-secondary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
              {tWorkflow("eyebrow")}
            </span>
            <h2 className="landing-text-primary mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              {tWorkflow("title")}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Static demo block */}
            <div className="landing-card-strong rounded-2xl p-6 md:p-8">
              <h3 className="landing-text-primary mb-4 text-lg font-semibold">
                {tWorkflow("step2Title")}
              </h3>
              <p className="landing-text-secondary mb-6 text-sm leading-relaxed">
                {tWorkflow("step2Desc")}
              </p>
              <div className="rounded-md border border-neutral-800 bg-black/40 p-4">
                <p className="font-mono text-xs text-neutral-400">
                  &quot;{tWorkflow("prompt")}&quot;
                </p>
              </div>
            </div>

            <div className="landing-card-strong rounded-2xl p-6 md:p-8">
              <h3 className="landing-text-primary mb-4 text-lg font-semibold">
                {tWorkflow("step3Title")}
              </h3>
              <p className="landing-text-secondary mb-6 text-sm leading-relaxed">
                {tWorkflow("step3Desc")}
              </p>
              <div className="rounded-md border border-neutral-800 bg-black/40 p-4">
                <p className="text-xs text-neutral-500">
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
