import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { env } from "@/lib/env";
import { defaultLocale, locales } from "@/i18n";
import { ThemeProvider } from "@/components/theme-provider";
import { ModalProvider } from "@/components/modal-provider";
import { DesktopAuthProvider } from "@/components/providers/DesktopAuthProvider";
import { Analytics } from "@vercel/analytics/react";

const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2EFE5" },
    { media: "(prefers-color-scheme: dark)", color: "#0D1511" },
  ],
};

export const metadata: Metadata = {
  title: "Lattice OS — Deterministic Multi-Model AI Infrastructure",
  description: "Build deterministic multi-model AI workflows with UCOL routing, sovereign telemetry, and memory-native infrastructure.",
  manifest: '/lattice.webmanifest',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: "Lattice OS — Deterministic Multi-Model AI Infrastructure",
    description: "Build deterministic multi-model AI workflows with UCOL routing, sovereign telemetry, and memory-native infrastructure.",
    type: 'website',
    siteName: 'Lattice OS',
    url: '/',
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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Locale is resolved from the NEXT_LOCALE cookie and validated against
  // supported locales. Invalid or missing cookies fall back to defaultLocale.
  // This prevents lang attribute mismatch when a cookie names an unsupported
  // locale (e.g. cookie=fr while only en is supported).
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = locales.includes(cookieLocale as any) ? cookieLocale : defaultLocale;

  return (
    <html lang={locale} suppressHydrationWarning={true}>
      <body className={`${inter.variable} font-sans`} suppressHydrationWarning={true}>
        <ClerkProvider
          publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k"}
          appearance={{
            variables: {
              colorPrimary: "var(--lattice-verdigris)",
              colorPrimaryForeground: "var(--lattice-on-verdigris)",
              colorForeground: "var(--lattice-text)",
              colorMutedForeground: "var(--lattice-text-muted)",
              colorMuted: "var(--lattice-chrome)",
              colorNeutral: "var(--lattice-text)",
              colorBackground: "var(--lattice-panel)",
              colorInput: "var(--lattice-canvas)",
              colorInputForeground: "var(--lattice-text)",
              colorBorder: "var(--lattice-control-border)",
              colorRing: "var(--lattice-focus)",
              colorDanger: "var(--lattice-danger)",
              colorWarning: "var(--lattice-warning)",
              colorSuccess: "var(--lattice-verdigris)",
              borderRadius: "var(--radius)",
            },
          }}
        >
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true} disableTransitionOnChange={true}>
            <ModalProvider>
              <DesktopAuthProvider>
                {children}
              </DesktopAuthProvider>
            </ModalProvider>
            <Analytics />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
