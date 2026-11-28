import * as React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { InstallEntry, InstallProvider } from '@/components/install/install-provider';
import { TerminalInstall } from '@/components/install/terminal-install';
import { DesktopDownloads } from '@/components/desktop-downloads';

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

describe('installation entry and release boundaries', () => {
  test('keeps a working downloads link in server-rendered markup', () => {
    const html = renderToStaticMarkup(<InstallEntry />);
    expect(html).toContain('href="/downloads"');
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('/releases/download/');
  });
  test('renders the provider with no browser globals and no popup during SSR', () => {
    const panels = { windows: null, macos: null, linux: null };
    const html = renderToStaticMarkup(<InstallProvider desktopPanels={panels} terminalPanels={panels}><InstallEntry /></InstallProvider>);
    expect(html).toContain('Choose an installation');
    expect(html).not.toContain('role="dialog"');
  });
  test('withholds desktop links and CLI commands until their independent release gates approve them', () => {
    const desktop = renderToStaticMarkup(<DesktopDownloads compact platform="windows" />);
    const terminal = renderToStaticMarkup(<TerminalInstall platform="windows" />);
    expect(desktop).toContain('pending qualification');
    expect(desktop).not.toContain('/releases/download/');
    expect(terminal).toContain('first verified CLI release');
    expect(terminal).not.toContain('gh release download');
  });
});

test('the PWA manifest and real icon sizes meet installation requirements without protecting static assets', () => {
  const manifest = JSON.parse(readFileSync(resolve('public/lattice.webmanifest'), 'utf8'));
  expect(manifest).toMatchObject({ id: '/', name: 'Lattice OS', start_url: '/dashboard', scope: '/', display: 'standalone' });
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((entry: { sizes: string }) => entry.sizes === `${size}x${size}`);
    const png = readFileSync(resolve('public', icon.src.slice(1)));
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  const source = readFileSync(resolve('proxy.ts'), 'utf8');
  const pattern = source.match(/matcher: \[\s*('(?:\\.|[^'])*')/)![1];
  const matcher = pattern.slice(1, -1).replace(/\\\\/g, '\\');
  expect(unstable_doesMiddlewareMatch({ config: { matcher }, url: '/lattice.webmanifest' })).toBe(false);
  expect(unstable_doesMiddlewareMatch({ config: { matcher }, url: '/lattice-icon-192.png' })).toBe(false);
  expect(readFileSync(resolve('app/[locale]/layout.tsx'), 'utf8')).toContain("manifest: '/lattice.webmanifest'");
});
