import type { UserProviderKeyScenario } from '@testsupport/cli/scenario';

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

export const PROVIDER_KEY_SCENARIOS: UserProviderKeyScenario[] = [
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

export const CLI_REQUIRED_ENV = {
  prompt: ['LATTICE_API_URL', 'LATTICE_CLI_TOKEN', 'LATTICE_USER_ID'],
  doctor: ['LATTICE_API_URL', 'LATTICE_CLI_TOKEN'],
} as const;
