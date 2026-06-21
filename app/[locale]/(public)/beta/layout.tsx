import type { Metadata } from "next";
import { LandingNavbar } from "@/components/landing/navbar";

export const metadata: Metadata = {
  title: "Lattice OS · Beta Guide",
  description:
    "Onboarding guides for Lattice OS beta testers — Quick Start, Developer, Enterprise, and Privacy tracks.",
  robots: { index: false, follow: false },
};

export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-screen flex flex-col">
      <LandingNavbar />
      <main className="flex-grow">{children}</main>
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Lattice OS Beta · Built by JJEM Global Technology, Inc. · Questions?{" "}
        <a className="underline" href="https://gen1e.xyz/support">
          Support
        </a>
      </footer>
    </div>
  );
}
