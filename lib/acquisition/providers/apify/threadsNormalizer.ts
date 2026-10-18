// lib/acquisition/providers/apify/threadsNormalizer.ts
// Threads vertical: strict actor-row schema + deterministic normalization to EvidenceObjectV1.
// NO Threads semantics in generic provider/apify-client boundary — only here.

import { z } from 'zod';
import {
  type EvidenceObjectV1,
  type AccessState,
  rawContentHash,
  evidenceCacheKey,
  type CanonicalResource,
} from '../../contracts';
import { stableSerialize } from './stableJson';

// ── 1. Actor-row schema (trust boundary) ────────────────────────────────

// The actor reports unavailable fields as null; canonical evidence uses undefined.
const optionalActorField = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(value => value === null ? undefined : value, schema.optional());

/** Dataset schema for automation-lab/threads-scraper build 0.1.47. */
export const ThreadsActorRowSchema = z.object({
  // Identity / classification
  type: optionalActorField(z.enum(['profile', 'post'])),
  postId: optionalActorField(z.string()),
  code: optionalActorField(z.string()), // post short code
  userId: optionalActorField(z.string()),
  username: optionalActorField(z.string()),
  fullName: optionalActorField(z.string()),
  biography: optionalActorField(z.string()),
  isVerified: optionalActorField(z.boolean()),
  followerCount: optionalActorField(z.number().int().nonnegative()),
  profilePicUrl: optionalActorField(z.string().url()),
  url: optionalActorField(z.string().url()), // canonical post/profile URL

  // Post fields
  text: optionalActorField(z.string()),
  likeCount: optionalActorField(z.number().int().nonnegative()),
  replyCount: optionalActorField(z.number().int().nonnegative()),
  repostCount: optionalActorField(z.number().int().nonnegative()),
  quoteCount: optionalActorField(z.number().int().nonnegative()),
  mediaType: optionalActorField(z.enum(['photo', 'image', 'video', 'carousel', 'text'])
    .transform(type => type === 'photo' ? 'image' : type)),
  media: optionalActorField(z.array(z.object({
    type: optionalActorField(z.enum(['photo', 'image', 'video'])
      .transform(type => type === 'photo' ? 'image' : type)),
    url: optionalActorField(z.string().url()),
    videoUrl: optionalActorField(z.string().url()),
    thumbnailUrl: optionalActorField(z.string().url()),
  }).passthrough()).transform(items => items.flatMap(item => {
    const url = item.type === 'video' ? item.videoUrl ?? item.url : item.url;
    return item.type && url ? [{ type: item.type, url, thumbnailUrl: item.thumbnailUrl }] : [];
  }))),

  // Temporal
  timestamp: optionalActorField(z.union([
    z.string(),
    z.number().int().nonnegative().max(8_640_000_000_000)
      .transform(seconds => new Date(seconds * 1000).toISOString()),
  ])),
  postedAt: optionalActorField(z.string()), // alternative field name
  date: optionalActorField(z.string()), // actor ISO publication date

  // Allow unknown fields — preserved in provenance
}).passthrough();

export type ThreadsActorRow = z.infer<typeof ThreadsActorRowSchema>;

/** Validation result at the trust boundary. */
export type ThreadsActorRowResult =
  | { ok: true; row: ThreadsActorRow }
  | { ok: false; error: 'MALFORMED_REQUIRED_FIELDS' | 'UNKNOWN_ROW_TYPE'; issues: z.ZodIssue[] };

export function validateThreadsActorRow(raw: unknown): ThreadsActorRowResult {
  // First: check if raw object has ANY known Threads actor fields.
  // If not, it's an unknown row type (completely foreign structure).
  const knownFields = ['type', 'postId', 'code', 'userId', 'username', 'fullName', 'biography', 'isVerified', 'followerCount', 'profilePicUrl', 'url', 'text', 'likeCount', 'replyCount', 'repostCount', 'quoteCount', 'mediaType', 'media', 'timestamp', 'postedAt'];
  const hasKnownFields = raw && typeof raw === 'object' && Object.keys(raw as Record<string, unknown>).some(k => knownFields.includes(k));

  // If no known fields at all → UNKNOWN_ROW_TYPE (don't even try schema)
  if (!hasKnownFields) {
    return {
      ok: false,
      error: 'UNKNOWN_ROW_TYPE',
      issues: [],
    };
  }

  const result = ThreadsActorRowSchema.safeParse(raw);
  if (!result.success) {
    // Schema failed but had known fields → MALFORMED_REQUIRED_FIELDS
    return {
      ok: false,
      error: 'MALFORMED_REQUIRED_FIELDS',
      issues: result.error.issues,
    };
  }
  // Schema passed, but check for minimum identity requirements
  // A row needs at least one identity field: postId/code for posts, userId/username for profiles
  // Note: 'type' is a classifier, not an identity field
  const row = result.data;
  const hasPostIdentity = row.postId || row.code;
  const hasProfileIdentity = row.userId || row.username;
  const hasAnyIdentity = hasPostIdentity || hasProfileIdentity; // type does NOT count as identity
  if (!hasAnyIdentity) {
    return {
      ok: false,
      error: 'MALFORMED_REQUIRED_FIELDS',
      issues: [{ code: 'custom', message: 'Missing identity fields (postId/code/userId/username)', path: [] }],
    };
  }
  return { ok: true, row: result.data };
}

// ── 2. Deterministic identity ───────────────────────────────────────────

/** Stable evidence identity: platform + canonical URL + content hash. */
function computeThreadsEvidenceId(
  platform: 'threads',
  canonicalUrl: string,
  contentHash: string
): string {
  // djb2(platform + '|' + canonicalUrl + '|' + contentHash) — deterministic
  let h = 5381;
  const str = `${platform}|${canonicalUrl}|${contentHash}`;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return `ev:${h.toString(16)}`;
}

/** Canonical Threads URL from actor row. */
function canonicalThreadsUrl(row: ThreadsActorRow): string {
  if (row.url) {
    try {
      const u = new URL(row.url);
      // Strip tracking params the actor might carry
      for (const p of ['xmt', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'igsh', 'share_url', 'fbclid', 'si']) {
        u.searchParams.delete(p);
      }
      u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
      return u.toString();
    } catch {
      // fall through
    }
  }
  // Reconstruct from identity fields
  if (row.type === 'post' && row.code) {
    return `https://threads.net/@${row.username ?? 'unknown'}/post/${row.code}`;
  }
  if (row.type === 'profile' && row.username) {
    return `https://threads.net/@${row.username}`;
  }
  if (row.postId) {
    return `https://threads.net/@${row.username ?? 'unknown'}/post/${row.postId}`;
  }
  return `https://threads.net/@${row.username ?? row.userId ?? 'unknown'}`;
}

/** External ID from actor row. */
function externalIdFromRow(row: ThreadsActorRow): string {
  if (row.postId) return row.postId;
  if (row.code) return row.code;
  if (row.userId) return row.userId;
  if (row.username) return row.username;
  return `unknown-${rawContentHash(stableSerialize(row)).slice(0, 8)}`;
}

// ── 3. Conservative AccessState ─────────────────────────────────────────

/**
 * A4 AccessState vocabulary (conservative — extends A0 with more precision).
 * A3 established: empty successful dataset = success, not failure.
 * A4 invariant: provider failure ≠ NOT_FOUND; missing optional field ≠ inaccessible.
 * These map to the canonical AccessState enum in contracts.ts.
 */
export const ThreadsAccessStateSchema = z.enum([
  'PUBLIC_AVAILABLE',      // Normalized evidence produced
  'PUBLIC_NOT_FOUND',      // Actor explicitly returned not-found signal (404-equivalent)
  'PUBLIC_RESTRICTED',     // Actor returned explicit restricted signal (private/age-gated)
  'PROVIDER_UNAVAILABLE',  // Actor run failed / dataset unavailable
  'UNKNOWN',               // No deterministic signal
]);
export type ThreadsAccessState = z.infer<typeof ThreadsAccessStateSchema>;

/** Map Threads-specific access state to canonical AccessState. */
export function mapThreadsAccessState(state: ThreadsAccessState): AccessState {
  switch (state) {
    case 'PUBLIC_AVAILABLE': return 'PUBLIC_FETCHABLE';
    case 'PUBLIC_NOT_FOUND': return 'NOT_FOUND';
    case 'PUBLIC_RESTRICTED': return 'PRIVATE_UNAUTHORIZED';
    case 'PROVIDER_UNAVAILABLE': return 'PROVIDER_BLOCKED';
    case 'UNKNOWN': return 'UNKNOWN';
  }
}

/**
 * Derive access state from normalized evidence + actor row.
 * Empty dataset from successful run → PUBLIC_AVAILABLE (A3 rule).
 * Actor row with explicit "not found" → PUBLIC_NOT_FOUND.
 * Actor row with explicit "private/restricted" → PUBLIC_RESTRICTED.
 * Provider run failed → PROVIDER_UNAVAILABLE.
 * Everything else → UNKNOWN.
 */
export function deriveThreadsAccessState(args: {
  providerRunSucceeded: boolean;
  row: ThreadsActorRow | null;
  explicitNotFound: boolean;
  explicitRestricted: boolean;
}): ThreadsAccessState {
  if (!args.providerRunSucceeded) return 'PROVIDER_UNAVAILABLE';
  if (args.explicitNotFound) return 'PUBLIC_NOT_FOUND';
  if (args.explicitRestricted) return 'PUBLIC_RESTRICTED';
  if (args.row) return 'PUBLIC_AVAILABLE';
  // Empty dataset but provider succeeded
  return 'PUBLIC_AVAILABLE';
}

// ── 4. Normalizer: RawEvidence → EvidenceObjectV1 ───────────────────────

export interface ThreadsNormalizerDeps {
  providerRunId: string;
  datasetId: string | undefined;
  providerActorId: string;
  acquisitionRequestId: string;
  retrievedAt: string;
  providerRunSucceeded: boolean;
}

/**
 * Normalize a single validated actor row to EvidenceObjectV1.
 * Throws on malformed rows (caller should catch and record normalization_failed).
 */
export function normalizeThreadsEvidence(
  validatedRow: ThreadsActorRow,
  deps: ThreadsNormalizerDeps
): EvidenceObjectV1 {
  const platform: 'threads' = 'threads';
  const canonicalUrl = canonicalThreadsUrl(validatedRow);
  const externalId = externalIdFromRow(validatedRow);
  const resourceType = validatedRow.type === 'profile' ? 'profile' : 'post';

  // Content hash of the canonical normalized object (for provenance)
  const contentHash = rawContentHash(stableSerialize({
    type: validatedRow.type,
    postId: validatedRow.postId,
    code: validatedRow.code,
    userId: validatedRow.userId,
    username: validatedRow.username,
    text: validatedRow.text,
    timestamp: validatedRow.timestamp ?? validatedRow.postedAt ?? validatedRow.date,
    likeCount: validatedRow.likeCount,
    replyCount: validatedRow.replyCount,
    repostCount: validatedRow.repostCount,
    quoteCount: validatedRow.quoteCount,
    mediaType: validatedRow.mediaType,
    media: validatedRow.media,
  }));

  const evidenceId = computeThreadsEvidenceId(platform, canonicalUrl, contentHash);

  // Detect explicit not-found/restricted signals from actor
  // (actor-specific — automation-lab/threads-scraper doesn't emit these today,
  // but the normalizer contract accounts for future actor versions)
  const explicitNotFound = false;
  const explicitRestricted = false;

  const accessState = deriveThreadsAccessState({
    providerRunSucceeded: deps.providerRunSucceeded,
    row: validatedRow,
    explicitNotFound,
    explicitRestricted,
  });

  // Map to canonical AccessState for EvidenceObjectV1
  const canonicalAccessState = mapThreadsAccessState(accessState);

  const cacheKey = evidenceCacheKey({
    platform,
    resourceType,
    originalUrl: '',
    canonicalUrl,
    externalId,
    handle: validatedRow.username,
  });

  return {
    id: evidenceId,
    acquisitionRequestId: deps.acquisitionRequestId,
    source: {
      category: 'social',
      platform,
      provider: 'apify',
      providerActorId: deps.providerActorId,
      providerRunId: deps.providerRunId,
    },
    resource: {
      type: resourceType,
      originalUrl: '', // never in EvidenceObjectV1
      canonicalUrl,
      externalId,
    },
    author: validatedRow.username ? {
      externalId: validatedRow.userId,
      handle: validatedRow.username,
      displayName: validatedRow.fullName,
    } : undefined,
    content: {
      text: validatedRow.text,
      title: undefined,
      media: validatedRow.media?.map(m => ({
        type: m.type,
        sourceUrl: m.url,
      })),
      links: [], // Threads posts don't have extractable links in actor output
    },
    engagement: {
      likes: validatedRow.likeCount ?? undefined, // null stays undefined — not zero
      replies: validatedRow.replyCount ?? undefined,
      shares: (validatedRow.repostCount ?? 0) + (validatedRow.quoteCount ?? 0),
      views: undefined,
    },
    temporal: {
      publishedAt: validatedRow.timestamp ?? validatedRow.postedAt ?? validatedRow.date,
      observedAt: deps.retrievedAt,
      retrievedAt: deps.retrievedAt,
    },
    access: { state: canonicalAccessState },
    provenance: {
      rawHash: contentHash,
      normalizerVersion: 'threads-v1',
      actorVersion: deps.providerActorId, // automation-lab/threads-scraper@build
    },
    cacheKey,
  };
}

/**
 * Batch normalize a full dataset. Unknown/malformed rows are explicit failures.
 * Returns { evidence: EvidenceObjectV1[], failures: { rowIndex: number; error: string }[] }.
 */
export function normalizeThreadsDataset(
  rawEvidence: { raw: unknown; contentHash: string; retrievalMetadata: any }[],
  deps: ThreadsNormalizerDeps
): { evidence: EvidenceObjectV1[]; failures: { rowIndex: number; error: string }[] } {
  const evidence: EvidenceObjectV1[] = [];
  const failures: { rowIndex: number; error: string }[] = [];

  for (let i = 0; i < rawEvidence.length; i += 1) {
    const item = rawEvidence[i];
    const validation = validateThreadsActorRow(item.raw);

    if (!validation.ok) {
      failures.push({ rowIndex: i, error: `${validation.error}: ${validation.issues.map(x => x.message).join(', ')}` });
      continue;
    }

    try {
      const normalized = normalizeThreadsEvidence(validation.row, deps);
      evidence.push(normalized);
    } catch (e) {
      failures.push({ rowIndex: i, error: `normalization_exception: ${(e as Error).message}` });
    }
  }

  return { evidence, failures };
}
