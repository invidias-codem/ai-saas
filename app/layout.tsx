import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { env } from "@/lib/env";

// 1. Import the provider
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Genie",
  description: "AI Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider 
      publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
    >
      {/* 2. Add suppressHydrationWarning to html */}
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          {/* 3. Wrap children with ThemeProvider */}
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}