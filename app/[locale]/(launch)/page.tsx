import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MineralLaunch } from '@/components/marketing/product-hunt/MineralLaunch';
import './launch/launch.css';

// The campaign design is now the canonical English homepage, not an A/B test.
// Keep /en/launch as the separately noindexed, reviewable campaign route.
export const metadata: Metadata = {
  title: 'Lattice OS — Make something real from a single idea',
  description:
    'Turn an idea into software with Lattice Code Builder. Plan, generate, and inspect code in a connected AI workspace.',
  alternates: { canonical: '/en' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Lattice OS — Make something real from a single idea',
    description: 'Plan, generate, and inspect software projects with AI.',
    type: 'website',
    siteName: 'Lattice OS',
    url: '/en',
  },
};

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Only English copy has been approved. Do not present English text as
  // translated Thai, Vietnamese, Spanish, French or German content.
  // Locale-specific root pages can be restored as translations ship.
  if (locale !== 'en') redirect('/en');

  return <MineralLaunch />;
}
