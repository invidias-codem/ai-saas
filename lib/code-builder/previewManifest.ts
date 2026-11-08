/**
 * Phase 8A: validate the immutable source snapshot before it reaches a
 * billable sandbox. This does not execute generated code.
 *
 * Trust boundary:
 * - GeneratedFile.path and .content are untrusted model output.
 * - Never accept an untrusted package/configuration override.
 * - The sandbox uses a trusted, pinned app template in a later slice.
 * - This validator is NOT a secret scanner or a browser isolation boundary.
 */
import { createHash } from 'node:crypto';
import type { GeneratedFile } from '@/lib/ucol/types';

export const PREVIEW_MANIFEST_VERSION = 1 as const;
export const MAX_PREVIEW_FILES = 100;
export const MAX_PREVIEW_FILE_BYTES = 256 * 1024;
export const MAX_PREVIEW_TOTAL_BYTES = 6 * 1024 * 1024;

export type PreviewStatus =
  | 'queued'
  | 'assembling'
  | 'provisioning'
  | 'installing'
  | 'building'
  | 'starting'
  | 'ready'
  | 'sleeping'
  | 'expired'
  | 'failed';

export type PreviewVisibility = 'private' | 'unlisted' | 'public';

export interface PreviewSourceFile {
  readonly path: string;
  readonly content: string;
}

export interface PreviewManifest {
  readonly schemaVersion: typeof PREVIEW_MANIFEST_VERSION;
  readonly buildId: string;
  readonly artifactSha256: string;
  readonly byteLength: number;
  readonly entry: string;
  readonly files: readonly PreviewSourceFile[];
}

export type PreviewArtifactErrorCode =
  | 'INVALID_BUILD_ID'
  | 'INVALID_ARTIFACTS'
  | 'TOO_MANY_FILES'
  | 'INVALID_PATH'
  | 'RESERVED_PATH'
  | 'DUPLICATE_PATH'
  | 'INVALID_CONTENT'
  | 'TOO_LARGE'
  | 'MISSING_ENTRY';

export class PreviewArtifactError extends Error {
  constructor(readonly code: PreviewArtifactErrorCode) {
    super(`Invalid preview artifact: ${code}`);
    this.name = 'PreviewArtifactError';
  }
}

const RESERVED_DIRS = new Set([
  '.git', '.next', '.vercel', '.turbo', '.cache', 'node_modules', '.pnpm-store',
]);
const RESERVED_FILES = new Set([
  '.npmrc', '.yarnrc', '.pnp.cjs', 'package.json', 'package-lock.json',
  'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'tsconfig.json',
  'vercel.json', 'dockerfile', 'docker-compose.yml', 'procfile',
  'layout.tsx', 'globals.css',
]);

const ENTRY_CANDIDATES = [
  'app/page.tsx',
  'src/app/page.tsx',
  'pages/index.tsx',
  'src/pages/index.tsx',
  'src/App.tsx',
  'App.tsx',
  'index.html',
] as const;

function normalizePath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 240) {
    throw new PreviewArtifactError('INVALID_PATH');
  }
  // No path normalization that could silently transform traversal or aliases.
  if (
    value.startsWith('/') || value.startsWith('~') ||
    value.includes('\\') || value.includes('//') ||
    /[\x00-\x1f\x7f<>:"|?*]/.test(value)
  ) {
    throw new PreviewArtifactError('INVALID_PATH');
  }
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new PreviewArtifactError('INVALID_PATH');
  }
  const lowered = parts.map(part => part.toLowerCase());
  if (lowered.some(part => RESERVED_DIRS.has(part))) {
    throw new PreviewArtifactError('RESERVED_PATH');
  }
  const filename = lowered[lowered.length - 1];
  if (
    RESERVED_FILES.has(filename) ||
    filename.startsWith('.env') ||
    /^(next|postcss|tailwind|eslint|vite)\.config\./i.test(filename)
  ) {
    throw new PreviewArtifactError('RESERVED_PATH');
  }
  return value;
}

/**
 * Pure, deterministic, content-addressed manifest. buildId is a UUID owned
 * by the authenticated caller; ownership must be checked by the API BEFORE
 * calling this function.
 */
export function makePreviewManifest(
  buildId: string,
  generatedFiles: readonly PreviewSourceFile[],
): PreviewManifest {
  if (!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(buildId)) {
    throw new PreviewArtifactError('INVALID_BUILD_ID');
  }
  if (!Array.isArray(generatedFiles) || generatedFiles.length === 0) {
    throw new PreviewArtifactError('INVALID_ARTIFACTS');
  }
  if (generatedFiles.length > MAX_PREVIEW_FILES) {
    throw new PreviewArtifactError('TOO_MANY_FILES');
  }

  const seen = new Set<string>();
  let totalBytes = 0;
  const files: PreviewSourceFile[] = generatedFiles.map(file => {
    const path = normalizePath(file?.path);
    const lookup = path.toLowerCase();
    if (seen.has(lookup)) throw new PreviewArtifactError('DUPLICATE_PATH');
    seen.add(lookup);
    if (typeof file?.content !== 'string' || file.content.trim().length === 0) {
      throw new PreviewArtifactError('INVALID_CONTENT');
    }
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_PREVIEW_FILE_BYTES) {
      throw new PreviewArtifactError('TOO_LARGE');
    }
    totalBytes += bytes;
    if (totalBytes > MAX_PREVIEW_TOTAL_BYTES) {
      throw new PreviewArtifactError('TOO_LARGE');
    }
    return { path, content: file.content };
  });

  const byPath = new Map(files.map(file => [file.path.toLowerCase(), file.path]));
  const entry = ENTRY_CANDIDATES.map(candidate => byPath.get(candidate.toLowerCase()))
    .find((candidate): candidate is string => Boolean(candidate));
  if (!entry) throw new PreviewArtifactError('MISSING_ENTRY');

  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const hasher = createHash('sha256').update(`lattice-preview-manifest-v${PREVIEW_MANIFEST_VERSION}\0`);
  for (const file of files) {
    const contentBytes = Buffer.from(file.content, 'utf8');
    hasher.update(file.path).update('\0');
    hasher.update(String(contentBytes.length)).update('\0');
    hasher.update(contentBytes).update('\0');
  }
  return {
    schemaVersion: PREVIEW_MANIFEST_VERSION,
    buildId,
    artifactSha256: hasher.digest('hex'),
    byteLength: totalBytes,
    entry,
    files,
  };
}
