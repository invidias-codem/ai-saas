import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SkillDefinition } from './schemas/skill.js';

const skillRegistry = new Map<string, SkillDefinition>();

export function registerSkill(skill: SkillDefinition): void {
  skillRegistry.set(skill.slug, skill);
}

export function getSkill(slug: string): SkillDefinition | undefined {
  return skillRegistry.get(slug);
}

export function listSkills(): SkillDefinition[] {
  return Array.from(skillRegistry.values());
}

export function loadSkillMarkdown(slug: string): string {
  const skill = skillRegistry.get(slug);
  if (!skill?.markdownPath) {
    return '';
  }

  const resolved = path.isAbsolute(skill.markdownPath)
    ? skill.markdownPath
    : path.resolve(process.cwd(), skill.markdownPath);

  try {
    return readFileSync(resolved, 'utf-8');
  } catch {
    return '';
  }
}
