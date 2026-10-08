// lib/acquisition/providers/apify/stableJson.ts
// Deterministic JSON serialization for provenance hashing: sorted keys,
// stable ordering — equivalent objects never produce different hashes.

export function stableSerialize(value: unknown): string {
  const canon = (v: unknown): string => {
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    if (typeof v === 'object') {
      const keys = Object.keys(v as Record<string, unknown>).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    return JSON.stringify(v);
  };
  return canon(value);
}
