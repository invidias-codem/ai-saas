import { notFound } from "next/navigation";
import { MineralCopperExpertLandingLayout } from "@/components/marketing/mineral-copper-expert-landing-layout";

const VALID_VARIANTS = ["a", "b", "c"] as const;
type Variant = (typeof VALID_VARIANTS)[number];

interface PageProps {
  params: Promise<{ variant: string }>;
}

export default async function ExpertVariantPage({ params }: PageProps) {
  const { variant } = await params;

  if (!VALID_VARIANTS.includes(variant as Variant)) {
    notFound();
  }

  return <MineralCopperExpertLandingLayout variant={variant as Variant} />;
}

// Static generation for all variant slugs
export function generateStaticParams() {
  return VALID_VARIANTS.map((variant) => ({ variant }));
}
