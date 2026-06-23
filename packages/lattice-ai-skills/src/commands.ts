import type { SkillDefinition } from './schemas/skill.js';

export interface SlashCommandContext {
  userId?: string;
  workspaceId?: string;
  locale?: string;
}

export interface SlashCommandResult {
  skillSlug: string;
  message: string;
}

export type SlashCommandHandler = (
  command: string,
  skill: SkillDefinition,
  context: SlashCommandContext,
) => SlashCommandResult | Promise<SlashCommandResult>;

const handlers = new Map<string, SlashCommandHandler>();

export function registerSlashCommand(command: string, handler: SlashCommandHandler): void {
  handlers.set(command, handler);
}

export async function resolveSlashCommand(
  command: string,
  skill: SkillDefinition,
  context: SlashCommandContext,
): Promise<SlashCommandResult | null> {
  const handler = handlers.get(command);
  if (!handler) {
    return null;
  }
  return handler(command, skill, context);
}
