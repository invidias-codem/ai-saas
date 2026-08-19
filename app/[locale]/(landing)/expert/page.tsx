import type { Metadata } from "next";
import { ExpertHero } from "@/components/marketing/expert-hero";
import { ProblemGrid } from "@/components/marketing/problem-grid";
import { SolutionMatrix } from "@/components/marketing/solution-matrix";
import { SocialProof } from "@/components/marketing/social-proof";
import { WorkflowDemo } from "@/components/marketing/workflow-demo";
import { UseCases } from "@/components/marketing/use-cases";
import { Governance } from "@/components/marketing/governance";
import { ConversionFooter } from "@/components/marketing/conversion-footer";

export const metadata: Metadata = {
  title: "Lattice | Expert-as-a-Service for teams that need AI with context",
  description:
    "Turn your company's knowledge into a persistent AI expert that understands your documents and code, remembers context, and helps your team complete work across connected tools.",
  openGraph: {
    title: "Lattice | Expert-as-a-Service for teams that need AI with context",
    description:
      "Turn your company's knowledge into a persistent AI expert that understands your documents and code, remembers context, and helps your team complete work across connected tools.",
    type: "website",
  },
};

export default function ExpertLandingPage() {
  return (
    <main className="bg-[#050505]">
      <ExpertHero />
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
