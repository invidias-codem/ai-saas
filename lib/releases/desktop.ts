import { z } from 'zod';
import catalog from './desktop-catalog.json';

export const DESKTOP_REPOSITORY = 'invidias-codem/ai-saas';
export const DESKTOP_BUILDS_URL = `https://github.com/${DESKTOP_REPOSITORY}/actions/workflows/desktop-packages.yml`;
export const DESKTOP_PLATFORMS = [
  { id: 'windows', name: 'Windows', architecture: 'x64', minimum: 'Windows 11 · WebView2 runtime', available: true },
  { id: 'linux', name: 'Linux', architecture: 'x64', minimum: 'Ubuntu 22.04 or later · WebKitGTK 4.1', available: true },
  { id: 'macos', name: 'macOS', architecture: 'Apple silicon / Intel', minimum: 'Native permissions and installer qualification pending', available: false },
] as const;
export const DESKTOP_PACKAGES = [
  { id: 'windows-x64-setup', platform: 'windows', label: 'Windows installer (.exe)', filename: 'lattice-desktop-windows-x64-setup.exe' },
  { id: 'linux-x64-appimage', platform: 'linux', label: 'Linux AppImage', filename: 'lattice-desktop-linux-x64.AppImage' },
  { id: 'linux-x64-deb', platform: 'linux', label: 'Debian / Ubuntu package (.deb)', filename: 'lattice-desktop-linux-x64.deb' },
] as const;
const artifactSchema = z.object({
  target: z.enum(['windows-x64-setup', 'linux-x64-appimage', 'linux-x64-deb']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().positive().max(2 * 1024 ** 3),
  nativeUiTested: z.literal(true), installTested: z.literal(true), nativeSigned: z.boolean(),
}).strict();
export const DesktopReleaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/), channel: z.enum(['candidate', 'stable']),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), publishedAt: z.string().datetime(),
  provenanceVerified: z.literal(true), securityReviewed: z.literal(true),
  recoveryTested: z.boolean(), upgradeTested: z.boolean(), rollbackTested: z.boolean(),
  artifacts: z.array(artifactSchema).min(1).max(DESKTOP_PACKAGES.length),
}).strict().superRefine((release, context) => {
  if (new Set(release.artifacts.map(a => a.target)).size !== release.artifacts.length) {
    context.addIssue({ code: 'custom', message: 'Duplicate desktop package' });
  }
  if ((release.channel === 'candidate') !== release.version.includes('-rc.')) {
    context.addIssue({ code: 'custom', message: 'Version does not match the release channel' });
  }
  if (release.channel === 'stable' && (!release.recoveryTested || !release.upgradeTested || !release.rollbackTested ||
    release.artifacts.some(a => a.target.startsWith('windows-') && !a.nativeSigned))) {
    context.addIssue({ code: 'custom', message: 'Stable desktop releases require recovery, upgrade, rollback and Windows signing evidence' });
  }
});
export type DesktopRelease = z.infer<typeof DesktopReleaseSchema>;
export function parseDesktopCatalog(input: unknown): DesktopRelease | null {
  const parsed = z.object({ schemaVersion: z.literal(1), release: DesktopReleaseSchema.nullable() }).strict().safeParse(input);
  return parsed.success ? parsed.data.release : null;
}
export const getDesktopRelease = () => parseDesktopCatalog(catalog);

/** Version and asset names are fixed; neither user input nor arbitrary mirrors choose a download URL. */
export function desktopAssetUrl(release: DesktopRelease, target: string): string {
  DesktopReleaseSchema.parse(release);
  const asset = DESKTOP_PACKAGES.find(p => p.id === target);
  if (!asset || !release.artifacts.some(a => a.target === target)) throw new Error('Desktop package is unavailable');
  return `https://github.com/${DESKTOP_REPOSITORY}/releases/download/desktop-v${release.version}/${asset.filename}`;
}
