import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MineralLaunch } from "@/components/marketing/product-hunt/MineralLaunch";
import "../(launch)/launch/launch.css";

// The public homepage owns its own Mineral/Copper navigation and footer.
// It lives outside the (landing) route group to avoid duplicate chrome.
export const metadata: Metadata = {
  title: "Lattice OS — Make something real from a single idea",
  description:
    "Plan, generate, and inspect software with Lattice Code Builder and connected AI workspaces. Build with AI and keep your work yours.",
  alternates: { canonical: "/en" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Lattice OS — Make something real from a single idea",
    description:
      "From an idea to reviewable code. Build software with AI and keep it yours.",
    type: "website",
  },
};

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // The launch copy is currently English-only, as on /en/launch.
  // Do not serve English copy under alternate-language canonical URLs.
  if (locale !== "en") redirect("/en");

  return <MineralLaunch />;
}
