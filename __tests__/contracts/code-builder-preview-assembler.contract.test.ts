import {
  assemblePreviewProject,
  projectFiles,
  previewProjectSelfCheck,
} from '@/lib/code-builder/previewAssembler';
import type { PreviewManifest } from '@/lib/code-builder/previewManifest';
import type { PreviewSourceFile } from '@/lib/code-builder/previewManifest';

const buildId = '11111111-1111-1111-1111-111111111111';
const page = (content = "import { Button } from '../components/Button';\nexport default function Page() { return <Button />; }\n"): PreviewSourceFile => ({
  path: 'app/page.tsx',
  content,
});
const button = (content = 'export const Button = () => <button>hi</button>;\n'): PreviewSourceFile => ({
  path: 'components/Button.tsx',
  content,
});

function manifest(files: PreviewSourceFile[]): PreviewManifest {
  return {
    schemaVersion: 1,
    buildId,
    artifactSha256: 'x',
    byteLength: 0,
    entry: 'app/page.tsx',
    files,
  };
}

describe('code builder preview assembler (Phase 8B)', () => {
  it('assembles template + generated files into one file tree', () => {
    const project = assemblePreviewProject(manifest([page(), button()]));
    expect(project.files.has('package.json')).toBe(true);
    expect(project.files.has('next.config.mjs')).toBe(true);
    expect(project.files.has('app/layout.tsx')).toBe(true);
    expect(project.files.has('app/page.tsx')).toBe(true);
    expect(project.files.has('components/Button.tsx')).toBe(true);
    expect(project.files.get('app/page.tsx')).toContain("from '../components/Button'");
  });

  it('passes import check when all relative imports resolve', () => {
    const project = assemblePreviewProject(manifest([page(), button()]));
    expect(project.importCheck.ok).toBe(true);
    expect(project.importCheck.unresolved).toEqual([]);
  });

  it('reports unresolved relative imports', () => {
    const missing = page("import { Nope } from '../components/Nope';\nexport default function Page() { return <Nope />; }\n");
    const project = assemblePreviewProject(manifest([missing]));
    expect(project.importCheck.ok).toBe(false);
    expect(project.importCheck.unresolved.length).toBeGreaterThan(0);
    expect(project.importCheck.unresolved[0].specifier).toBe('../components/Nope');
  });

  it('treats external package imports as resolved', () => {
    const external = page("import { useState } from 'react';\nexport default function Page() { return null; }\n");
    const project = assemblePreviewProject(manifest([external]));
    expect(project.importCheck.ok).toBe(true);
  });

  it('resolves index files in directories', () => {
    const withIndex = manifest([
      page("import { Toolbar } from './components';\nexport default function Page() { return <Toolbar />; }\n"),
      { path: 'app/components/index.tsx', content: 'export const Toolbar = () => null;\n' },
    ]);
    const project = assemblePreviewProject(withIndex);
    expect(project.importCheck.ok).toBe(true);
  });

  it('never lets generated files overwrite trusted template files', () => {
    const overriding = page("export default function Layout() { return null; }\n");
    const project = assemblePreviewProject(manifest([
      { path: 'app/layout.tsx', content: 'MALICIOUS OVERRIDE' },
      overriding,
    ]));
    expect(project.files.get('app/layout.tsx')).toBe("export const metadata = { title: 'Lattice Preview' };\n" +
      "export default function RootLayout({ children }: { children: React.ReactNode }) {\n" +
      '  return <html lang="en"><body>{children}</body></html>;\n' +
      '}\n');
  });

  it('sorts project files deterministically', () => {
    const project = assemblePreviewProject(manifest([page(), button()]));
    const paths = projectFiles(project).map(f => f.path);
    expect(paths).toEqual([...paths].sort());
  });

  it('self-check passes', () => {
    expect(() => previewProjectSelfCheck()).not.toThrow();
  });
});
