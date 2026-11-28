import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/components/integrations/RepoSelectorModal', () => ({
  RepoSelectorModal: () => null,
}));
jest.mock('@/lib/icons/brandIcons', () => ({
  BrandIcon: () => React.createElement('span', null, 'icon'),
}));

import { IntegrationsSection } from '@/app/[locale]/(dashboard)/(routes)/settings/IntegrationsSection';

describe('Settings mobile GitHub card', () => {
  it('keeps Connect action in a wrapping and full-width mobile layout', () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsSection, {
      initialGithub: { connected: false, username: null },
      initialTrello: { connected: false, username: null },
    }));
    expect(html).toContain('Connect GitHub');
    expect(html).toContain('sm:flex-row');
    expect(html).toContain('min-w-0');
    expect(html).toContain('flex-wrap');
    expect(html).toContain('w-full');
  });
  it('does not claim that a saved OAuth token is verified', () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsSection, {
      initialGithub: { connected: false, hasStoredCredential: true, username: 'accountwithaverylonglogin' },
      initialTrello: { connected: false, username: null },
    }));
    expect(html).toContain('Stored credential not yet verified');
    expect(html).not.toContain('Connected as');
  });
});
