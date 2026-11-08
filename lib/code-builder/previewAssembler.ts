/**
 * Phase 8B: assemble a verified, runnable Next.js project from a validated
 * preview manifest. Does not execute code — just produces the file tree a
 * sandbox (Phase 8C) will write and boot.
 *
 * Trust boundary:
 * - Template files are hardcoded and pinned; never derived from model output.
 * - Generated files come only from a validated PreviewManifest (Phase 8A).
 * - Import verification is best-effort static resolution, not a type check.
 */
import type { PreviewManifest, PreviewSourceFile } from './previewManifest';

export interface PreviewProject {
  readonly manifest: PreviewManifest;
  // Every file to write into the sandbox: template + generated, keyed by path.
  readonly files: ReadonlyMap<string, string>;
  readonly importCheck: ImportCheck;
}

export interface ImportCheck {
  readonly ok: boolean;
  readonly unresolved: readonly UnresolvedImport[];
}

export interface UnresolvedImport {
  readonly file: string;
  readonly specifier: string;
  readonly resolved: string;
}

// ---------------------------------------------------------------------------
// Trusted template — pinned, vetted, NOT model output.
// ---------------------------------------------------------------------------

const TEMPLATE_FILES: ReadonlyMap<string, string> = new Map([
  [
    'package.json',
    JSON.stringify(
      {
        name: 'lattice-preview-app',
        version: '1.0.0',
        private: true,
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
        },
        dependencies: {
          next: '16.2.9',
          react: '18.3.1',
          'react-dom': '18.3.1',
        },
        devDependencies: {
          typescript: '5.5.4',
          '@types/react': '19.0.0',
          '@types/node': '20.0.0',
        },
      },
      null,
      2,
    ),
  ],
  [
    'next.config.mjs',
    "export default {\n  reactStrictMode: true,\n  output: 'standalone',\n};\n",
  ],
  [
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'react-jsx',
          incremental: true,
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      },
      null,
      2,
    ),
  ],
  [
    'app/layout.tsx',
    "export const metadata = { title: 'Lattice Preview' };\n" +
      "export default function RootLayout({ children }: { children: React.ReactNode }) {\n" +
      '  return <html lang="en"><body>{children}</body></html>;\n' +
      '}\n',
  ],
  [
    'app/globals.css',
    '* { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; }\n',
  ],
]);

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function assemblePreviewProject(manifest: PreviewManifest): PreviewProject {
  const files = new Map<string, string>();
  for (const [path, content] of TEMPLATE_FILES) {
    files.set(path, content);
  }
  // Defense in depth: generated files never overwrite trusted template files,
  // even if the validator (Phase 8A) somehow allows them.
  const templatePaths = new Set(TEMPLATE_FILES.keys());
  for (const file of manifest.files) {
    if (templatePaths.has(file.path)) continue;
    files.set(file.path, file.content);
  }

  const unresolved: UnresolvedImport[] = [];
  for (const file of manifest.files) {
    if (!file.path.endsWith('.ts') && !file.path.endsWith('.tsx')) continue;
    const dir = dirname(file.path);
    for (const specifier of extractImportSpecifiers(file.content)) {
      if (isExternal(specifier)) continue;
      const resolved = resolveRelativeImport(dir, specifier, files);
      if (!resolved) {
        unresolved.push({ file: file.path, specifier, resolved: `${dir}/${specifier}` });
      }
    }
  }

  return {
    manifest,
    files,
    importCheck: { ok: unresolved.length === 0, unresolved },
  };
}

/** All template + generated files as a sorted array, ready to write to disk. */
export function projectFiles(project: PreviewProject): PreviewSourceFile[] {
  return [...project.files.entries()]
    .map(([path, content]) => ({ path, content }))
    .sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

// ---------------------------------------------------------------------------
// Import resolution (static, best-effort)
// ---------------------------------------------------------------------------

const IMPORT_RE =
  /(?:^|[\n;{}])\s*import\s+(?:[^"';\n]*?\s+from\s*)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractImportSpecifiers(content: string): string[] {
  const specs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(content))) specs.push(match[1]);
  IMPORT_RE.lastIndex = 0;
  while ((match = DYNAMIC_IMPORT_RE.exec(content))) specs.push(match[1]);
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  return specs;
}

function isExternal(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/');
}

function dirname(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '.';
}

function tryFile(
  files: ReadonlyMap<string, string>,
  dir: string,
  specifier: string,
): string | null {
  const base = joinPath(dir, specifier);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
  ];
  for (const candidate of candidates) {
    if (files.has(normalized(candidate))) return candidate;
  }
  return null;
}

function resolveRelativeImport(
  dir: string,
  specifier: string,
  files: ReadonlyMap<string, string>,
): string | null {
  // Strip query/fragment if any (e.g. "./Foo?raw").
  const clean = specifier.split('?')[0].split('#')[0];
  return tryFile(files, dir, clean) ?? null;
}

function joinPath(dir: string, specifier: string): string {
  const resolved = dir === '.' ? specifier : `${dir}/${specifier}`;
  return normalized(resolved);
}

function normalized(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { parts.pop(); continue; }
    parts.push(part);
  }
  return parts.join('/') || '.';
}

// ---------------------------------------------------------------------------
// Integrity (self-check, no framework)
// ---------------------------------------------------------------------------

export function previewProjectSelfCheck(): void {
  const manifest = makeTestManifest();
  const project = assemblePreviewProject(manifest);
  if (!project.importCheck.ok) {
    throw new Error(`preview assembler self-check failed: unresolved imports: ${JSON.stringify(project.importCheck.unresolved)}`);
  }
  if (!project.files.has('app/page.tsx')) throw new Error('missing entry page');
  if (!project.files.has('package.json')) throw new Error('missing template package.json');
}

// Minimal manifest for the self-check — not part of the public API surface.
function makeTestManifest(): PreviewManifest {
  return {
    schemaVersion: 1,
    buildId: '00000000-0000-0000-0000-000000000000',
    artifactSha256: 'self-check',
    byteLength: 0,
    entry: 'app/page.tsx',
    files: [
      { path: 'app/page.tsx', content: "import { Button } from '../components/Button';\nexport default function Page() { return <Button />; }\n" },
      { path: 'components/Button.tsx', content: 'export const Button = () => <button>hi</button>;\n' },
    ],
  };
}
