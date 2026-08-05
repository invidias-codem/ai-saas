import { jest } from '@jest/globals';

const originalConsoleError = console.error;

function silenceProviderKeyWarnings() {
  console.error = (...args) => {
    const text = args.map(String).join(' ');
    if (text.includes('[USER_PROVIDER_KEYS_DECRYPT]') || text.includes('[USER_PROVIDER_KEYS_STATUS]')) {
      return;
    }
    originalConsoleError(...args);
  };
}

describe('lib/userProviderKeys', () => {
  let modulePath;

  beforeEach(() => {
    silenceProviderKeyWarnings();
    jest.resetModules();
    modulePath = '/Users/jjem/Projects/ai-saas/lib/userProviderKeys.ts';
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('reports empty status when supabaseAdmin is missing', async () => {
    jest.doMock(modulePath, () => {
      const actual = jest.requireActual(modulePath);
      return {
        ...actual,
        getUserProviderApiKeys: async () => ({}),
      };
    });

    const actual = await import(modulePath);
    const status = await actual.getConfiguredProviderKeys('user-1');
    expect(status.openai.configured).toBe(false);
    expect(status.anthropic.configured).toBe(false);
    expect(status.google.configured).toBe(false);
  });

  it('masks provider key previews', async () => {
    const actual = await import(modulePath);
    expect(actual.maskProviderKey('sk-proj-abcdef-secret')).toBe('sk-pr...cret');
    expect(actual.maskProviderKey('sk-ant-shortkey')).toBe('sk-a...key');
    expect(actual.maskProviderKey('AIzaSuperLongKeyValue')).toBe('AIza...lue');
    expect(actual.maskProviderKey('sk-secret')).toBe('sk-s...ret');
    expect(actual.maskProviderKey('')).toBe(null);
    expect(actual.maskProviderKey(null)).toBe(null);
  });
});
