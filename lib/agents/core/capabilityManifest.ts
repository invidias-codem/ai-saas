// lib/agents/core/capabilityManifest.ts
// Phase 0 (#440): server-produced, per-request capability manifest.
//
// Single source of truth for (a) what the model is told it can do
// (buildWeaverSystemInstruction) and (b) which tools the authorized catalog
// exposes (buildAuthorizedToolSet in agenticToolSet.ts). No secrets, no
// external calls, no DB reads — callers pass explicit inputs.
//
// Status vocabulary (closed unions — extend deliberately, never by string):
//   connections:  not_connected | authorization_required | expired_reconnect_required
//                 | access_denied | provider_unavailable | unverified
//                 | connected_verified | no_matching_authorized_results
//   capabilities: available | unavailable | unsupported | unknown

export const CONNECTION_STATUSES = [
  'not_connected',
  'authorization_required',
  'expired_reconnect_required',
  'access_denied',
  'provider_unavailable',
  'unverified',
  'connected_verified',
  'no_matching_authorized_results',
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CAPABILITY_STATUSES = ['available', 'unavailable', 'unsupported', 'unknown'] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export type CapabilityId =
  | 'background_web_research'
  | 'long_term_memory'
  | 'workspace_context'
  | 'agentic_harness'
  | 'workspace_intelligence';

/** Provider verification evidence. Required (and checked) for connected_verified. */
export interface ConnectionVerification {
  method: string;
  checkedAt: string;
}

/** Caller-supplied connection facts. Phase 0 callers pass none (no external calls). */
export interface ConnectionInput {
  label: string;
  provider: string;
  hasPersistedCredential: boolean;
  verification?: ConnectionVerification | null;
}

export interface ConnectionSummary {
  label: string;
  provider: string;
  status: ConnectionStatus;
}

export interface CapabilityManifest {
  identity: 'weaver';
  resolvedMode: string;
  workspaceId: string | null;
  capabilities: Record<CapabilityId, CapabilityStatus>;
  connections: ConnectionSummary[];
}

/** Typed manifest failure — never a silent default (#440 acceptance). */
export class CapabilityManifestError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_RESOLVED_MODE' | 'VERIFICATION_REQUIRED',
  ) {
    super(message);
    this.name = 'CapabilityManifestError';
  }
}

/**
 * Map connection facts to a status. Runtime enforcement of #440: a persisted
 * credential WITHOUT verification evidence is `unverified` — `connected_verified`
 * is reachable only through connectionStatus() with a complete verification
 * record, and an incomplete record is a typed failure, not a downgrade.
 */
export function connectionStatus(input: ConnectionInput): ConnectionStatus {
  if (!input.hasPersistedCredential) return 'not_connected';
  if (!input.verification) return 'unverified';
  if (!input.verification.method || !input.verification.checkedAt) {
    throw new CapabilityManifestError(
      `connection '${input.label}': connected_verified requires verification evidence (method, checkedAt)`,
      'VERIFICATION_REQUIRED',
    );
  }
  return 'connected_verified';
}

/**
 * Build the per-request manifest. `resolvedMode` must be the RESOLVED runtime
 * mode (engine: parsed.mode || options.mode || 'fast'; worker: task payload mode).
 * Missing/invalid mode is a typed failure surfaced to the caller.
 */
export function buildCapabilityManifest(input: {
  resolvedMode: unknown;
  workspaceId: string | null | undefined;
  backgroundWebResearchEnabled: boolean;
  longTermMemoryEnabled: boolean;
  connections?: ConnectionInput[];
}): CapabilityManifest {
  if (typeof input.resolvedMode !== 'string' || input.resolvedMode.length === 0) {
    throw new CapabilityManifestError(
      'capability manifest requires a resolved runtime mode',
      'INVALID_RESOLVED_MODE',
    );
  }
  const isAgentic = input.resolvedMode === 'agentic';
  return {
    identity: 'weaver',
    resolvedMode: input.resolvedMode,
    workspaceId: input.workspaceId ?? null,
    capabilities: {
      // unavailable = supported by the runtime but switched off in this session.
      // unsupported = the resolved runtime/mode does not carry this capability at all.
      background_web_research: input.backgroundWebResearchEnabled ? 'available' : 'unavailable',
      long_term_memory: input.longTermMemoryEnabled ? 'available' : 'unavailable',
      workspace_context: input.workspaceId ? 'available' : 'unsupported',
      agentic_harness: isAgentic ? 'available' : 'unsupported',
      workspace_intelligence: isAgentic ? 'available' : 'unsupported',
    },
    connections: (input.connections ?? []).map((c) => ({
      label: c.label,
      provider: c.provider,
      status: connectionStatus(c),
    })),
  };
}

const CAPABILITY_LINES: Record<CapabilityId, Record<'available' | 'not', string>> = {
  background_web_research: {
    available:
      '- Web research: available. "Web Search Results" in your context means the system searched the live internet for you.',
    not: '- Web research: not available in this session. Do not claim to have searched the internet.',
  },
  long_term_memory: {
    available:
      '- Long-term memory: available. "User Profile" and "Relevant Previous Work" sections in your context mean the system retrieved stored context for you.',
    not: '- Long-term memory: unavailable in this session. Stored context is not being retrieved; do not claim to remember prior work.',
  },
  workspace_context: {
    available:
      '- Workspace context: a workspace is selected for this conversation; workspace-scoped documents and sources may appear in your context.',
    not: '- Workspace context: no workspace is selected for this conversation.',
  },
  agentic_harness: {
    available: '- Agentic tool use: this session runs with the tools the system has registered.',
    not: '- Agentic tool use: not supported in this session.',
  },
  workspace_intelligence: {
    available:
      '- Workspace intelligence (document discovery, source search): available through registered tools.',
    not: '- Workspace intelligence: not supported in this session.',
  },
};

function renderCapabilityLines(manifest: CapabilityManifest): string[] {
  return (Object.keys(CAPABILITY_LINES) as CapabilityId[]).map((id) => {
    const line = CAPABILITY_LINES[id];
    const status = manifest.capabilities[id];
    if (status === 'available') return line.available;
    // unsupported / unavailable / unknown all render as the not-available form;
    // the status union remains machine-readable for traces and tests.
    return line.not;
  });
}

function renderConnectionLines(manifest: CapabilityManifest): string[] {
  if (manifest.connections.length === 0) {
    return ['- Connections: none reported in this session.'];
  }
  return manifest.connections.map((c) => `- ${c.label} (${c.provider}): ${c.status.replace(/_/g, ' ')}`);
}

/**
 * Weaver system instruction derived entirely from the manifest.
 * Replaces the previous unconditional CAPABILITIES block (see #440): the
 * "Never deny these capabilities" and "speak authoritatively as if you
 * fetched it yourself" directives are gone.
 */
export function buildWeaverSystemInstruction(manifest: CapabilityManifest, date: Date = new Date()): string {
  const dateLine = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `You are Weaver, the assistant of Lattice OS. Older conversations may address you as "Genie" — that is a former name for the same assistant; you are not a different or separate product.
Current Date: ${dateLine}.

CAPABILITIES (server-provided for this session — the only source of truth):
${renderCapabilityLines(manifest).join('\n')}

CONNECTIONS (server-provided):
${renderConnectionLines(manifest).join('\n')}
- When you report on connections, use only these states: not connected, authorization required, reconnect required, access denied, provider unavailable, unverified, connected and verified. A stored credential without a completed provider verification is "unverified" — never "connected".

TRUTHFUL REPORTING:
- Speak about your access only from the CAPABILITIES list above and from actual tool results. Never claim a capability that is not listed as available, and never deny one that is.
- Never describe yourself as a stateless model with no access to stored information: Lattice OS maintains durable workspaces, documents, and retrieved context, and provides them to you as context sections.
- A count of past interactions is not retrieved history. You know only what appears in your context sections and tool results.
- If something is not in your context, say so plainly instead of guessing.

CITATION RULES:
- When you retrieve sources from the Data Refinery (query_workspace_sources), each result contains content and optional lineage.
- The content field is the factual text. Cite it using [1], [2], etc.
- The lineage field contains optional transition metadata (SUPERSEDES, CAUSES edges).
- Use lineage ONLY to explain WHY state changed (e.g., "X changed to Y in January"). Never cite lineage as a source.
- If a source has lineage showing SUPERSEDES: mention the transition in your prose, then cite the current content.

Provide informative and concise responses. When presenting structured data (like comparisons, statistics, lists suitable for plotting), format it as a standard GitHub Flavored Markdown table whenever possible to facilitate visualization. When you see 'User's Relevant Previous Work' or 'About This User' sections below, use that context to personalize your responses and maintain continuity with their previous interactions and preferences.`;
}

/**
 * Record capability resolution + exposed tool names (no secrets). Fire-and-
 * forget: telemetry must never fail the request or the worker run.
 */
export async function logCapabilityResolution(args: {
  userId?: string;
  workspaceId?: string;
  manifest: CapabilityManifest;
  surface: string;
  toolNames: string[];
}): Promise<void> {
  try {
    const { logEvent } = await import('@/lib/telemetry');
    logEvent({
      eventType: 'capability_manifest_resolved',
      userId: args.userId,
      workspaceId: args.workspaceId,
      metadata: {
        resolvedMode: args.manifest.resolvedMode,
        workspaceId: args.manifest.workspaceId,
        capabilities: args.manifest.capabilities,
        connections: args.manifest.connections,
        surface: args.surface,
        toolNames: args.toolNames,
      },
    });
  } catch {
    // telemetry is best-effort by contract
  }
}
