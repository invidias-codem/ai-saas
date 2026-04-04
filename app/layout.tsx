import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tech Genie',
  description: 'Memory-native AI with hybrid orchestration across self-hosted and frontier models.',
};

export default function AppRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
