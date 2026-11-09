import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MineralLaunch } from '@/components/marketing/product-hunt/MineralLaunch';
import './launch.css';

export const metadata: Metadata = {
  title: 'Lattice OS — Turn an idea into software with AI',
  description: 'Plan, generate, and inspect a software project with Lattice Code Builder and connected AI workspaces.',
  alternates: { canonical: '/en/launch' },
  robots: { index: false, follow: true },
};

export default async function LaunchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'en') redirect('/en/launch');
  return <MineralLaunch />;
}
