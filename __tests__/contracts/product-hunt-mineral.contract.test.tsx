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
  it('does not suggest unfinished publishing is available', () => {
    const html=renderToStaticMarkup(<MineralLaunch />);
    expect(html).toContain('publishing still in testing');
    expect(html).not.toContain('Private publishing is live');
    expect(html).not.toContain('Product of the Day');
  });
});
