import type { SkillDefinition } from './schemas/skill.js';
import type { SlashCommandContext } from './commands.js';

export interface SkillWrapperInput {
  prompt: string;
  skill: SkillDefinition;
  context: SlashCommandContext;
}

export interface SkillWrapperOutput {
  prompt: string;
  wrapped: boolean;
}

/**
 * Wrap an incoming prompt with skill-specific guidance.
 * Default implementation prepends the skill description to the prompt.
 */
export async function wrapSkillPrompt(input: SkillWrapperInput): Promise<SkillWrapperOutput> {
  const description = input.skill.description?.trim();

  if (!description || !input.skill.slashCommands.length) {
    return { prompt: input.prompt, wrapped: false };
  }

  const prefixed = `${description}\n\nUser request:\n${input.prompt}`;
  return { prompt: prefixed, wrapped: true };
}
