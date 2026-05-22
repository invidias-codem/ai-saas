import type { NormalizedResult } from './types';

type RawResult =
  | { ok: true; output: string; meta?: Record<string, unknown> }
  | { ok: false; error: string; code?: string; meta?: Record<string, unknown> };

function inferNormalizedCode(raw: RawResult): string | null {
  if (raw.ok) return null;

  const code = raw.code ?? null;
  const meta = raw.meta ?? {};
  const errorText = raw.error ?? '';

  if (errorText.includes('escapes workspace root')) return 'PATH_OUTSIDE_WORKSPACE';
  if (code === 'SEARCH_BLOCK_NOT_FOUND') return 'PATCH_NO_MATCH';
  if (code === 'MULTIPLE_MATCHES') return 'PATCH_MULTIPLE_MATCHES';
  if (code === 'COMMAND_FAILED' && meta.isTimedOut === true) return 'COMMAND_TIMEOUT';
  if (code === 'COMMAND_FAILED') return 'COMMAND_EXIT_NONZERO';
  if (code === 'SPAWN_ERROR') return 'INTERNAL_ERROR';
  if (code === 'READ_ERROR' && /ENOENT|no such file/i.test(errorText)) return 'FILE_NOT_FOUND';
  if (code === 'PATCH_ERROR' && /ENOENT|no such file/i.test(errorText)) return 'FILE_NOT_FOUND';
  if (code === 'READ_ERROR') return 'READ_ERROR';
  if (code === 'WRITE_ERROR') return 'WRITE_ERROR';
  if (code === 'PATCH_ERROR') return 'INTERNAL_ERROR';

  return code;
}

export function normalizeTsResult(raw: RawResult): NormalizedResult {
  const meta = (raw as any).meta ?? {};

  return {
    ok: raw.ok,
    code: inferNormalizedCode(raw),
    output: raw.ok ? raw.output ?? null : null,
    error: raw.ok ? null : raw.error ?? null,
    meta: {
      truncated: typeof meta.isTruncated === 'boolean' ? meta.isTruncated : null,
      timedOut: typeof meta.isTimedOut === 'boolean' ? meta.isTimedOut : null,
      exitCode: typeof meta.code === 'number' ? meta.code : null,
      signal: typeof meta.signal === 'string' ? meta.signal : null,
      limitBytes: (typeof meta.isTruncated === 'boolean' || typeof meta.isTimedOut === 'boolean') ? 524288 : null,
    },
  };
}
