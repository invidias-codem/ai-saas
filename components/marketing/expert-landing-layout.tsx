"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { ExpertHero } from "@/components/marketing/expert-hero";
import { ProblemGrid } from "@/components/marketing/problem-grid";
import { SolutionMatrix } from "@/components/marketing/solution-matrix";
import { SocialProof } from "@/components/marketing/social-proof";
import { WorkflowDemo } from "@/components/marketing/workflow-demo";
import { UseCases } from "@/components/marketing/use-cases";
import { Governance } from "@/components/marketing/governance";
import { ConversionFooter } from "@/components/marketing/conversion-footer";
import { logEvent } from "@/lib/telemetry";

type Variant = "a" | "b" | "c";

interface ExpertLandingLayoutProps {
  variant: Variant;
}

export function ExpertLandingLayout({ variant }: ExpertLandingLayoutProps) {
  // Emit telemetry on mount
  useEffect(() => {
    logEvent({
      eventType: "landing_variant_viewed",
      metadata: { variant },
    });
  }, [variant]);

  return (
    <main className="bg-[#050505]">
      <ExpertHero variant={variant} />
      <ProblemGrid />
      <SolutionMatrix />
      <SocialProof />
      <WorkflowDemo />
      <UseCases />
      <Governance />
      <ConversionFooter />
    </main>
  );
}
