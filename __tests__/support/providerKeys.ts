export interface UserProviderKeyScenario {
  scenario: string;
  input: {
    userId: string;
    provider: 'openai' | 'anthropic' | 'google';
    apiKey: string;
  };
  expectConfigured: boolean;
  expectMaskPreviewPrefix: string;
}

export const USER_PROVIDER_KEY_SCENARIOS: UserProviderKeyScenario[] = [
  {
    scenario: 'openai project key',
    input: { userId: 'user-1', provider: 'openai', apiKey: 'sk-proj-abcdef-secret' },
    expectConfigured: true,
    expectMaskPreviewPrefix: 'sk-pr',
  },
  {
    scenario: 'anthropic key',
    input: { userId: 'user-1', provider: 'anthropic', apiKey: 'sk-ant-shortkey' },
    expectConfigured: true,
    expectMaskPreviewPrefix: 'sk-a',
  },
  {
    scenario: 'google key',
    input: { userId: 'user-1', provider: 'google', apiKey: 'AIzaSuperLongKeyValue' },
    expectConfigured: true,
    expectMaskPreviewPrefix: 'AIza',
  },
  {
    scenario: 'missing key',
    input: { userId: 'user-1', provider: 'openai', apiKey: '' },
    expectConfigured: false,
    expectMaskPreviewPrefix: 'sk-',
  },
];
