import {
  makePreviewManifest,
  PreviewArtifactError,
  PREVIEW_MANIFEST_VERSION,
} from '@/lib/code-builder/previewManifest';
import type { GeneratedFile } from '@/lib/ucol/types';

const buildId = '0a97d455-a6b0-4ba4-b8d1-f2a99f9eff0c';
const generated = (path: string, content = 'export default function App() { return null; }'): GeneratedFile => ({
  path, content, language: 'tsx', component: 'test', model: 'nvidia/nemotron-3-ultra-550b-a55b',
});

function rejects(files: GeneratedFile[], code: string) {
  try {
    makePreviewManifest(buildId, files);
    throw new Error('expected a preview artifact error');
  } catch (error) {
    expect(error).toBeInstanceOf(PreviewArtifactError);
    expect((error as PreviewArtifactError).code).toBe(code);
  }
}

describe('code builder preview source manifest (Phase 8A)', () => {
  it('accepts a real-world page and components and generates a stable digest independent of input ordering', () => {
    const page = generated('app/page.tsx', 'import { Toolbar } from "../components/Toolbar"; export default function Page(){ return <Toolbar /> }');
    const component = generated('components/Toolbar.tsx', 'export const Toolbar = () => null;');
    const a = makePreviewManifest(buildId, [page, component]);
    const b = makePreviewManifest(buildId, [component, page]);
    expect(a.schemaVersion).toBe(PREVIEW_MANIFEST_VERSION);
    expect(a.entry).toBe('app/page.tsx');
    expect(a.artifactSha256).toBe(b.artifactSha256);
    expect(a.files.map(f => f.path)).toEqual(b.files.map(f => f.path));
    expect(a.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes the artifact digest when source changes', () => {
    const a = makePreviewManifest(buildId, [generated('app/page.tsx', 'export default () => 1;')]);
    const b = makePreviewManifest(buildId, [generated('app/page.tsx', 'export default () => 2;')]);
    expect(a.artifactSha256).not.toBe(b.artifactSha256);
  });

  it.each([
    '../app/page.tsx', './app/page.tsx', '/etc/passwd',
    'app//page.tsx', 'app/../page.tsx', 'C:\\Users\\page.tsx',
  ])('rejects non-canonical or escaping path %s', path => {
    rejects([generated('app/page.tsx'), generated(path)], 'INVALID_PATH');
  });

  it.each([
    '.env', '.env.production', 'package.json', 'pnpm-lock.yaml',
    'next.config.js', 'node_modules/react/index.js', '.git/config',
  ])('rejects generated override of trusted environment %s', path => {
    rejects([generated('app/page.tsx'), generated(path)], 'RESERVED_PATH');
  });

  it('rejects case-insensitive duplicates', () => {
    rejects([generated('app/page.tsx'), generated('APP/PAGE.TSX')], 'DUPLICATE_PATH');
  });

  it('requires a bootable web entry', () => {
    rejects([generated('components/Toolbar.tsx')], 'MISSING_ENTRY');
  });

  it('rejects empty and oversized source', () => {
    rejects([generated('app/page.tsx', '   ')], 'INVALID_CONTENT');
    rejects([generated('app/page.tsx', 'x'.repeat(256 * 1024 + 1))], 'TOO_LARGE');
  });

  it('rejects malformed build identity', () => {
    expect(() => makePreviewManifest('../other', [generated('app/page.tsx')]))
      .toThrow(PreviewArtifactError);
  });
});
