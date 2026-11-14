import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DesktopDownloads } from '@/components/desktop-downloads';
import { DESKTOP_PLATFORMS } from '@/lib/releases/desktop';

type Props = { params: Promise<{ platform: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { platform } = await params;
  const target = DESKTOP_PLATFORMS.find(p => p.id === platform);
  return { title: target ? `Lattice OS Desktop for ${target.name}` : 'Desktop downloads' };
}
export default async function DesktopPlatformPage({ params }: Props) {
  const { platform } = await params;
  if (!DESKTOP_PLATFORMS.some(p => p.id === platform)) notFound();
  return <main className="min-h-screen bg-background px-4 pb-16 sm:px-6 lg:px-10 pt-10 sm:pt-14 text-foreground"><div className="mx-auto max-w-6xl">
    <Link href="/downloads" className="mb-8 inline-block text-sm text-primary">← All downloads</Link>
    <DesktopDownloads platform={platform} />
    <p className="text-sm leading-7 text-muted-foreground">For a test build, open the latest successful desktop package run, download the artifact for your OS, extract the archive and compare its SHA-256 checksum. On Windows, run the setup executable. On Linux, install the Debian package or mark the AppImage executable before opening it. Native file permissions and every write still require your consent.</p>
  </div></main>;
}
