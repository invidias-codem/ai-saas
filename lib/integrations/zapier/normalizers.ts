import type { ZapierSaveMemoryRequest } from './schemas';

export function normalizeZapierTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];

  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 20)
    )
  );
}

export function buildZapierMemoryMetadata(input: ZapierSaveMemoryRequest) {
  const { sourceApp, sourceEntityType, sourceEntityId, sourceUrl, userVisibleTitle, metadata } = input;

  return {
    integration: 'zapier',
    sourceApp,
    sourceEntityType,
    sourceEntityId,
    sourceUrl: sourceUrl ?? null,
    title: userVisibleTitle ?? null,
    ...metadata,
  };
}
