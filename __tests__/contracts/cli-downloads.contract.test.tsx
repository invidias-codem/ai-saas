jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DownloadsPage from '@/app/[locale]/(landing)/downloads/page';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CLI downloads release gate', () => {
  test('renders every planned target without offering unavailable binaries', () => {
    const html = renderToStaticMarkup(<DownloadsPage />);
    expect(html).toContain('First verified release in preparation');
    expect(html.match(/Not released yet/g)).toHaveLength(5);
    expect(html).not.toContain('/releases/download/');
    expect(html).not.toContain('curl ');
    expect(html).toContain('Apple silicon');
    expect(html).toContain('Windows');
    expect(html).toContain('doctor --offline --json');
  });
  test('adds only exact public download pages; no wildcard or download API exemption', () => {
    const source = readFileSync(resolve(__dirname, '../../proxy.ts'), 'utf8');
    expect(source).toContain("'/downloads',");
    expect(source).toContain("'/:locale(en|th|vi|es|fr|de)/downloads',");
    expect(source).not.toContain("'/downloads(.*)'");
    expect(source).not.toContain("'/api/downloads");
  });
});
