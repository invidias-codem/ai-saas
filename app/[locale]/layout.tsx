import type { Metadata, Viewport } from "next";
import "../globals.css";
import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';
import { getSiteUrl } from '@/lib/site-url';

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2EFE5" },
    { media: "(prefers-color-scheme: dark)", color: "#0D1511" },
  ],
};

const metadataMessages: Record<string, { title: string; description: string; keywords: string }> = {
    en: {
      title: "Lattice OS — Deterministic Multi-Model AI Infrastructure",
      description: "Build deterministic multi-model AI workflows with UCOL routing, sovereign telemetry, and memory-native infrastructure. Chameleon Consultant, Weaver Code, and enterprise-grade orchestration.",
      keywords: "deterministic AI, multi-model routing, UCOL, sovereign AI, data refinery, persona architecture, Chameleon Consultant, Weaver Code, Lattice OS, memory-native AI, agentic workflows, LLM orchestration, Vercel edge AI, Supabase AI, telemetry, context firewall, post-generation critic, Delta Engine, World Model"
    }
  };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!locales.includes(locale as any)) {
    notFound();
  }

  const t = metadataMessages[locale] ?? metadataMessages.en;

  return {
    metadataBase: new URL(getSiteUrl()),
    title: t.title,
    description: t.description,
    keywords: t.keywords,
    manifest: '/lattice.webmanifest',
    appleWebApp: { capable: true, title: 'Lattice OS', statusBarStyle: 'default' },
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      title: t.title,
      description: t.description,
      type: 'website',
      siteName: 'Lattice OS',
      url: `/${locale}`,
      images: [
        {
          url: '/og-image.jpg',
          width: 1200,
          height: 630,
          type: 'image/jpeg',
          alt: 'Lattice OS — Interconnected Intelligence',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.description,
      images: ['/og-image.jpg'],
    },
    icons: {
      icon: [
        { url: '/favicon.png', sizes: '64x64', type: 'image/png' },
        { url: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!locales.includes(locale as any)) {
    notFound();
  }

  const messages = (await import(`@/messages/${locale}.json`)).default;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
