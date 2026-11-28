import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstallProvider } from '@/components/install/install-provider';

// Render the modal in SSR to assert the fallback's actual DOM semantics.
// Radix Dialog normally unmounts closed content during server rendering.
jest.mock('@/components/ui/dialog', () => {
  const React = require('react') as typeof import('react');
  const Wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  return { Dialog: Wrapper, DialogContent: Wrapper, DialogHeader: Wrapper, DialogTitle: Wrapper, DialogDescription: Wrapper };
});

describe('installation chooser browser fallback', () => {
  test('renders Continue in browser as a button, never a dashboard redirect', () => {
    const panels = { windows: null, macos: null, linux: null };
    const html = renderToStaticMarkup(
      <InstallProvider desktopPanels={panels} terminalPanels={panels}>
        <main id="original-page">Downloads</main>
      </InstallProvider>
    );
    expect(html).toContain('id="original-page"');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Continue in browser →<\/button>/);
    expect(html).not.toMatch(/<a[^>]*href="\/dashboard"[^>]*>Continue in browser/);
    // The distinct downloads navigation remains available.
    expect(html).toContain('All downloads &amp; requirements');
  });
});
