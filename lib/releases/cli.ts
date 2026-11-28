import { z } from 'zod';
import catalog from './cli-catalog.json';

export const CLI_REPOSITORY = 'invidias-codem/ai-saas';
export const CLI_WORKFLOW = `${CLI_REPOSITORY}/.github/workflows/build-lattice-cli.yml`;
export const CLI_TARGETS = [
  { id: 'macos-arm64', os: 'macOS', architecture: 'Apple silicon', minimum: 'macOS 14 or later', filename: 'lattice-macos-arm64' },
  { id: 'macos-amd64', os: 'macOS', architecture: 'Intel x64', minimum: 'macOS 15 or later', filename: 'lattice-macos-amd64' },
  { id: 'linux-amd64', os: 'Linux', architecture: 'x64', minimum: 'Ubuntu 22.04+ / glibc 2.35+', filename: 'lattice-linux-amd64' },
  { id: 'linux-arm64', os: 'Linux', architecture: 'ARM64', minimum: 'Ubuntu 22.04+ / glibc 2.35+', filename: 'lattice-linux-arm64' },
  { id: 'windows-amd64', os: 'Windows', architecture: 'x64', minimum: 'Windows 11; Docker Desktop with Linux containers', filename: 'lattice-windows-amd64.exe' },
] as const;

const version = z.string().regex(/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/);
const artifact = z.object({
  target: z.enum(['macos-arm64', 'macos-amd64', 'linux-amd64', 'linux-arm64', 'windows-amd64']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive().max(256 * 1024 * 1024),
  smokeTested: z.literal(true),
  nativeSigned: z.boolean(),
}).strict();

export const CliReleaseSchema = z.object({
  version,
  channel: z.enum(['candidate', 'stable']),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  publishedAt: z.string().datetime(),
  provenanceVerified: z.literal(true),
  securityReviewed: z.literal(true),
  deploymentSmokeTested: z.boolean(),
  rollbackTested: z.boolean(),
  artifacts: z.array(artifact).length(CLI_TARGETS.length),
}).strict().superRefine((release, ctx) => {
  if (new Set(release.artifacts.map(a => a.target)).size !== CLI_TARGETS.length) {
    ctx.addIssue({ code: 'custom', message: 'Every supported target must appear exactly once' });
  }
  if ((release.channel === 'candidate') !== release.version.includes('-rc.')) {
    ctx.addIssue({ code: 'custom', message: 'Version must match release channel' });
  }
  if (release.channel === 'stable' && (!release.deploymentSmokeTested || !release.rollbackTested ||
    release.artifacts.some(a => a.target.startsWith('macos-') || a.target.startsWith('windows-') ? !a.nativeSigned : false))) {
    ctx.addIssue({ code: 'custom', message: 'Stable release requires deployment/rollback evidence and platform signing' });
  }
});
export type CliRelease = z.infer<typeof CliReleaseSchema>;

export const CliCatalogSchema = z.object({ schemaVersion: z.literal(1), release: CliReleaseSchema.nullable() }).strict();

/** Invalid or unapproved catalog data exposes no download links. */
export function parseCliCatalog(input: unknown): CliRelease | null {
  const parsed = CliCatalogSchema.safeParse(input);
  return parsed.success ? parsed.data.release : null;
}
export function getCliRelease(): CliRelease | null { return parseCliCatalog(catalog); }

/** URLs are derived exclusively from validated versions and fixed asset names. */
export function cliAssetUrl(release: CliRelease, filename: string): string {
  CliReleaseSchema.parse(release);
  const allowed: readonly string[] = [...CLI_TARGETS.map(t => t.filename), 'SHA256SUMS', 'release-manifest.json', 'install.sh', 'install.ps1'];
  if (!allowed.includes(filename)) throw new Error('Unrecognized release asset');
  return `https://github.com/${CLI_REPOSITORY}/releases/download/cli-v${release.version}/${filename}`;
}
export function verificationCommand(release: CliRelease, filename: string): string {
  cliAssetUrl(release, filename);
  return `gh attestation verify ${filename} --repo ${CLI_REPOSITORY} --signer-workflow ${CLI_WORKFLOW} --source-ref refs/heads/main --source-digest ${release.sourceCommit}`;
}
