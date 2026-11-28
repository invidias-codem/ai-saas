import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Mineral / Copper canonical public homepage', () => {
  it('reuses the approved design and its original first-party logo', () => {
    const root = source('app/[locale]/(home)/page.tsx');
    expect(root).toContain('MineralLaunch');
  });

  it('has one canonical indexed homepage and leaves /en/launch noindexed', () => {
    const launchPage = source('app/[locale]/(launch)/launch/page.tsx');
    expect(launchPage).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it('moves root outside the shared marketing navbar/footer layout', () => {
    expect(existsSync(join(process.cwd(), 'app/[locale]/(landing)/page.tsx'))).toBe(false);
    const root = source('app/[locale]/(home)/page.tsx');
    expect(root).toContain('<MineralLaunch />');
  });

  it('removes sticky root experiment but preserves direct expert variants and referrals', () => {
    const proxy = source('proxy.ts');
    expect(proxy).not.toContain('lattice_landing_variant');
    expect(proxy).not.toContain('NextResponse.rewrite(new URL(targetPath');
    expect(proxy).toContain("'/expert(.*)'");
    expect(proxy).toContain("'/launch'");
    expect(proxy).toContain('parseReferralParams');
    const expert = source('app/[locale]/(home)/expert/v/[variant]/page.tsx');
    expect(expert).toContain('VALID_VARIANTS');
    expect(expert).toContain('generateStaticParams');
    expect(expert).toContain('notFound()');
  });

  it('renders expert variants without the standard marketing navbar or footer', () => {
    expect(existsSync(join(process.cwd(), 'app/[locale]/(landing)/expert/v/[variant]/page.tsx'))).toBe(false);
    const expert = source('app/[locale]/(home)/expert/v/[variant]/page.tsx');
    expect(expert).toContain('MineralCopperExpertLandingLayout');
    const homeLayout = source('app/[locale]/(home)/layout.tsx');
    expect(homeLayout).not.toContain('LandingNavbar');
    expect(homeLayout).not.toContain('LandingFooter');
    const marketingLayout = source('app/[locale]/(landing)/layout.tsx');
    expect(marketingLayout).toContain('<LandingNavbar />');
    expect(marketingLayout).toContain('<LandingFooter />');
    expect(marketingLayout).not.toContain('window.location');
  });

  it('provides lm-* expert styling matching rendered classes and dark theme', () => {
    const styles = source('app/[locale]/(landing)/expert/mineral-copper.css');
    const component = source('components/marketing/mineral-copper-expert-landing-layout.tsx');
    expect(styles).toContain('.lm-page');
    expect(styles).toContain('.lm-hero');
    expect(styles).toContain('.dark .lm-page');
    expect(styles).not.toContain('.mc-');
    expect(component).toContain("import '@/app/[locale]/(launch)/launch/launch.css'");
    expect(component).toContain('className="lm-page"');
    expect(component).toContain('className="lm-nav-wrap"');
  });
});
