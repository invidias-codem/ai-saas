import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MineralLaunch } from '@/components/marketing/product-hunt/MineralLaunch';

describe('Product Hunt Mineral/Copper public candidate', () => {
  it('contains a real CTA and accessible theme switch', () => {
    const html=renderToStaticMarkup(<MineralLaunch />);
    expect(html).toContain('href="/en/code/builder"');
    expect(html).toContain('Switch to dark mode');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Try Code Builder');
    expect(html).toContain('ILLUSTRATIVE WALKTHROUGH');
  });
  it('uses the existing first-party Lattice logo, not the illustrative triangle', () => {
    const html = renderToStaticMarkup(<MineralLaunch />);
    expect(html).toContain('lattice-logo.png');
    expect(html).toContain('Lattice OS');
    expect(html).not.toContain('M16 3.5 29 27.5H3L16 3.5Z');
  });
  it('does not suggest unfinished publishing is available', () => {
    const html=renderToStaticMarkup(<MineralLaunch />);
    expect(html).toContain('publishing still in testing');
    expect(html).not.toContain('Private publishing is live');
    expect(html).not.toContain('Product of the Day');
  });
});
