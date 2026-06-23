import { z } from 'zod';

/**
 * Contract for a single SKILL.md-style agent skill.
 */
export const skillDefinitionSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  slashCommands: z.array(z.string()).default([]),
  starterPrompts: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  markdownPath: z.string().min(1).optional(),
});

export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;

export const skillManifestSchema = z.object({
  skills: z.array(skillDefinitionSchema),
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;
