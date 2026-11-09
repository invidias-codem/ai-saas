import type { Metadata } from "next";
import { ProductHuntLaunch } from "@/components/landing/product-hunt-launch";

export const metadata: Metadata = {
  title: "Lattice OS — Build software with AI. Keep it yours.",
  description:
    "Turn a software idea into code you can inspect and an isolated preview you can test. Explore Code Builder and collaborative AI workspaces in Lattice OS.",
  openGraph: {
    title: "Lattice OS — Build software with AI. Keep it yours.",
    description:
      "From an idea to reviewable code and a testable application, together with AI.",
    type: "website",
  },
};

export default function LandingPage() {
  return <ProductHuntLaunch />;
}
