export const CLI_REQUIRED_ENV = {
  prompt: ['LATTICE_API_URL', 'LATTICE_CLI_TOKEN_OR_TOKEN', 'LATTICE_USER_ID'],
  doctor: ['LATTICE_API_URL', 'LATTICE_CLI_TOKEN_OR_TOKEN'],
} as const;

export type CliCommand = keyof typeof CLI_REQUIRED_ENV;

export function requiredEnvFor(command: CliCommand) {
  return CLI_REQUIRED_ENV[command] ?? [];
}
