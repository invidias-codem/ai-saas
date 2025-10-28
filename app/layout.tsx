// app/layout.tsx
import  Metadata  from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { env } from "@/lib/env"; // ✅ Import your env configuration

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
    // ✅ Pass the publishableKey from your environment variables
    <ClerkProvider 
      publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} //
    >
      <html lang="en">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}