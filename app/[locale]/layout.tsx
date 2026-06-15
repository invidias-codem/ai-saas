import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { env } from "@/lib/env";

import { ThemeProvider } from "@/components/theme-provider";
import { ModalProvider } from "@/components/modal-provider";
import { DesktopAuthProvider } from "@/components/providers/DesktopAuthProvider";
import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';
import { getSiteUrl } from '@/lib/site-url';
import { Analytics } from "@vercel/analytics/react";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const metadataMessages: Record<string, { title: string; description: string; keywords: string }> = {
  en: {
    title: "Lattice OS - Your AI Workspace",
    description: "A memory-native AI workspace for conversations, tools, and context-aware execution.",
    keywords: "AI workspace, memory-native AI, Lattice OS, workspace intelligence, AI productivity",
  },
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
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.description,
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
    <html lang={locale} suppressHydrationWarning={true}>
      <body className={`${inter.variable} font-sans`} suppressHydrationWarning={true}>
        <ClerkProvider
          publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k"}
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem={true}
              disableTransitionOnChange={true}
            >
              <ModalProvider>
                <DesktopAuthProvider>
                  {children}
                </DesktopAuthProvider>
              </ModalProvider>
              <Analytics />
            </ThemeProvider>
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
