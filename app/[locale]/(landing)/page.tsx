"use client";

import { HeroSection } from "@/components/landing/hero-section";
import { ProblemGrid } from "@/components/marketing/problem-grid";
import { SolutionMatrix } from "@/components/marketing/solution-matrix";
import { RosterGrid } from "@/components/marketing/RosterGrid";

function MechanicsSection() {
  return (
    <section id="mechanics">
      <ProblemGrid />
    </section>
  );
}

function ExpertsSection() {
  return (
    <section id="roster">
      <RosterGrid />
    </section>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <MechanicsSection />
      <SolutionMatrix />
      <ExpertsSection />
    </main>
  );
}
