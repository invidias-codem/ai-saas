import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage, { metadata } from '@/app/[locale]/(launch)/page';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Mineral / Copper canonical public homepage', () => {
  it('reuses the approved design and its original first-party logo', async () => {
    const element = await HomePage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('Make something');
    expect(html).toContain('Try Code Builder');
    expect(html).toContain('href="/en/code/builder"');
    expect(html).toContain('lattice-logo.png');
    expect(html).toContain('Lattice OS');
    expect(html).toContain('publishing still in testing');
  });

  it('has one canonical indexed homepage and leaves /en/launch noindexed', () => {
    expect(metadata.alternates).toEqual({ canonical: '/en' });
    expect(metadata.robots).toEqual({ index: true, follow: true });
    const launchPage = source('app/[locale]/(launch)/launch/page.tsx');
    expect(launchPage).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it('moves root outside the shared marketing navbar/footer layout', () => {
    expect(existsSync(join(process.cwd(), 'app/[locale]/(landing)/page.tsx'))).toBe(false);
    const root = source('app/[locale]/(launch)/page.tsx');
    expect(root).toContain('<MineralLaunch />');
    expect(root).toContain("redirect('/en')");
  });

  it('removes sticky root experiment but preserves direct expert variants and referrals', () => {
    const proxy = source('proxy.ts');
    expect(proxy).not.toContain('lattice_landing_variant');
    expect(proxy).not.toContain('NextResponse.rewrite(new URL(targetPath');
    expect(proxy).toContain("'/expert(.*)'");
    expect(proxy).toContain("'/launch'");
    expect(proxy).toContain('parseReferralParams');
    const expert = source('app/[locale]/(landing)/expert/v/[variant]/page.tsx');
    expect(expert).toContain('VALID_VARIANTS');
    expect(expert).toContain('generateStaticParams');
    expect(expert).toContain('notFound()');
  });
});
