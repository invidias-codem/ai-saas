import { z } from 'zod';

/** Windows shells are distinct capabilities; never silently substitute one. */
export const CommandShellSchema = z.enum(['direct', 'cmd', 'powershell', 'pwsh', 'sh']);
export type CommandShell = z.infer<typeof CommandShellSchema>;

export const CommandTextSchema = z.string().min(1).max(65536)
  .refine(value => value.trim().length > 0 && !value.includes('\0'), 'Command must be nonblank and contain no NUL');

export const ExecuteCommandSchema = z.object({
  command: CommandTextSchema.describe('Executable and quoted arguments by default. Select a shell explicitly to interpret scripts, pipes or operators.'),
  timeoutSeconds: z.number().int().positive().max(120),
  shell: CommandShellSchema.optional().describe('direct is the default. cmd, powershell (Windows PowerShell), and pwsh (PowerShell 7) require a Windows native harness.'),
});

export type ExecuteCommandInput = z.infer<typeof ExecuteCommandSchema>;

/** A POSIX quarantine runner must not reinterpret a Windows script as sh. */
export function buildCommandSandbox(input: { command: string; shell?: CommandShell }): string {
  if (input.shell && input.shell !== 'sh') {
    throw new Error('The selected shell requires an approved native harness; the POSIX quarantine runner cannot execute it.');
  }
  return `set -e\n${input.command}`;
}
