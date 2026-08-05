export const CLI_PROVIDER_SCHEMA = {
  command: ['prompt', 'doctor'],
  requiredEnvForCommand: {
    prompt: ['LATTICE_API_URL', 'LATTICE_CLI_TOKEN_OR_TOKEN', 'LATTICE_USER_ID'],
    doctor: ['LATTICE_API_URL', 'LATTICE_CLI_TOKEN_OR_TOKEN'],
  },
};

export function generateOnboardingChecklist() {
  return [
    { step: 'CLI_ENTRY', file: 'scripts/lattice-cli.mjs' },
    { step: 'API_ROUTE', file: 'app/api/cli/stream/route.ts' },
    { step: 'PROVIDER_KEY_STORAGE', file: 'lib/userProviderKeys.ts' },
    { step: 'KEY_SETTINGS_API', file: 'app/api/settings/keys/route.ts' },
    { step: 'PROVIDER_RESOLVER', file: 'lib/ucol/routing/providerResolver.ts' },
  ];
}
