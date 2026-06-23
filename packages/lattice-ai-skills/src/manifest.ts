import { listSkills } from './registry.js';

export interface CustomGPTManifest {
  schema_version: 'v1';
  name: string;
  description: string;
  prompt?: string;
  tools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  metadata?: Record<string, unknown>;
}

export function buildCustomGPTManifest(overrides?: Partial<CustomGPTManifest>): CustomGPTManifest {
  const skills = listSkills();
  const tools = skills.map((skill) => ({
    type: 'function' as const,
    function: {
      name: skill.slug,
      description: skill.description ?? `Lattice skill: ${skill.name}`,
      parameters: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Skill-specific request or payload.',
          },
        },
        required: ['input'],
      },
    },
  }));

  return {
    schema_version: 'v1',
    name: overrides?.name ?? 'Lattice AI Skills',
    description:
      overrides?.description ?? 'Lattice OS skill router: maps user requests to registered AI skills.',
    prompt: overrides?.prompt,
    tools,
    metadata: {
      skillCount: skills.length,
      slashCommands: skills.flatMap((skill) => skill.slashCommands),
      ...(overrides?.metadata ?? {}),
    },
  };
}
