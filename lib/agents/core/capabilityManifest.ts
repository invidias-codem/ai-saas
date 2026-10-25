// lib/agents/core/capabilityManifest.ts
// Phase 0 (#440): server-produced, per-request capability manifest.
//
// Single source of truth for (a) what the model is told it can do
// (buildWeaverSystemInstruction), (b) which tools the authorized catalog
// exposes (buildAuthorizedToolSet in agenticToolSet.ts), and (c) what the
// capability trace records. No secrets, no external calls, no DB reads —
// callers pass explicit EFFECTIVE runtime values, derived for the prepared
// path from the SAME read enforcement retrieval uses.
//
// Status vocabulary (closed unions — extend deliberately, never by string):
//   connections:  not_connected | authorization_required | expired_reconnect_required
//                 | access_denied | provider_unavailable | unverified
//                 | connected_verified | no_matching_authorized_results
//   capabilities: available | unavailable | unsupported | unknown
//
// Distinctions that must survive rendering (#440 review):
//   unavailable  = supported by the runtime, switched off for this session
//   unsupported  = this resolved runtime mode does not carry the capability
//   unknown      = availability not verified — never collapse into either

import type { AgentMode } from '@/lib/llm/types';
import {
  buildReadEnforcement,
  normalizePreparedContextPlan,
  type PreparedContextOptions,
  type PreparedContextPlan,
} from '@/lib/context/readEnforcement';

/** The resolved runtime mode vocabulary (lib/llm/types AgentMode). */
const AGENT_MODES: readonly AgentMode[] = ['fast', 'quality', 'agentic', 'reasoning'];

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
  | 'workspace_intelligence'
  | 'workspace_source_search';

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

export type CapabilitySurface = 'web' | 'trigger-worker';

export interface CapabilityManifest {
  identity: 'weaver';
  surface: CapabilitySurface;
  resolvedMode: AgentMode;
  workspaceId: string | null;
  capabilities: Record<CapabilityId, CapabilityStatus>;
  connections: ConnectionSummary[];
}

/** Typed manifest failure — never a silent default (#440 acceptance). */
export class CapabilityManifestError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_RESOLVED_MODE' | 'INVALID_VERIFICATION' | 'INVALID_CONNECTION_INPUT',
  ) {
    super(message);
    this.name = 'CapabilityManifestError';
  }
}

/**
 * Map connection facts to a status. Runtime enforcement of #440: a persisted
 * credential WITHOUT verification evidence is `unverified` — `connected_verified`
 * is reachable only through connectionStatus() with a COMPLETE verification
 * record (nonblank method, parseable checkedAt); anything less is a typed
 * failure, not a downgrade.
 */
export function connectionStatus(input: ConnectionInput): ConnectionStatus {
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (!label || typeof input.provider !== 'string' || !input.provider.trim()) {
    throw new CapabilityManifestError(
      'connection label and provider must be nonblank strings',
      'INVALID_CONNECTION_INPUT',
    );
  }
  if (!input.hasPersistedCredential) return 'not_connected';
  if (!input.verification) return 'unverified';
  const method = typeof input.verification.method === 'string' ? input.verification.method.trim() : '';
  const checkedAt =
    typeof input.verification.checkedAt === 'string' ? input.verification.checkedAt.trim() : '';
  if (!method || !checkedAt || Number.isNaN(Date.parse(checkedAt))) {
    throw new CapabilityManifestError(
      `connection '${label}': connected_verified requires a nonblank verification method and a parseable checkedAt date`,
      'INVALID_VERIFICATION',
    );
  }
  return 'connected_verified';
}

/**
 * Build the per-request manifest from EFFECTIVE runtime values (#440 review
 * finding 2: availability must reflect what this session can actually
 * execute, not just its resolved mode).
 *
 * `resolvedMode` must be the RESOLVED runtime mode and a member of the
 * AgentMode vocabulary; invalid/unknown/whitespace-only modes are typed
 * failures. The boolean inputs describe effective execution:
 *   memoryReadEnabled  — prepared-path memory retrieval is enforcement-allowed
 *   webResearchEnabled — background web research is enforcement-allowed
 *                        (researchReadAllowed: plan limits + skip flags +
 *                        disable gates all included — pass it through as-is)
 *   ioHarnessPresent  — context.ioHarness is supplied; the harness tools and
 *                      the LOCAL discovery tools refuse at execute-time
 *                      without it. query_workspace_sources is SERVER-SIDE
 *                      (workspace/user guards only) and follows the workspace
 *                      gate instead (#440 review finding 1).
 */
export function buildCapabilityManifest(input: {
  resolvedMode: unknown;
  workspaceId?: string | null;
  surface: CapabilitySurface;
  memoryReadEnabled: boolean;
  webResearchEnabled: boolean;
  ioHarnessPresent: boolean;
  connections?: ConnectionInput[];
}): CapabilityManifest {
  if (typeof input.resolvedMode !== 'string') {
    throw new CapabilityManifestError(
      'capability manifest requires a resolved runtime mode',
      'INVALID_RESOLVED_MODE',
    );
  }
  const resolvedMode = input.resolvedMode.trim() as AgentMode;
  if (!AGENT_MODES.includes(resolvedMode)) {
    throw new CapabilityManifestError(
      `resolved mode '${input.resolvedMode}' is not in the runtime mode vocabulary: ${AGENT_MODES.join(' | ')}`,
      'INVALID_RESOLVED_MODE',
    );
  }
  const isAgentic = resolvedMode === 'agentic';
  return {
    identity: 'weaver',
    surface: input.surface,
    resolvedMode,
    workspaceId: input.workspaceId ?? null,
    capabilities: {
      // Agentic runs reach the internet through the web_search tool (base
      // catalog); prepared runs only through background research sections,
      // which the read enforcement must allow.
      background_web_research: isAgentic
        ? 'available'
        : input.webResearchEnabled
          ? 'available'
          : 'unavailable',
      // Agentic memory = episodic recall, which requires the io harness;
      // prepared memory = the prepared-context sections the enforcement allows.
      long_term_memory: isAgentic
        ? input.ioHarnessPresent
          ? 'available'
          : 'unavailable'
        : input.memoryReadEnabled
          ? 'available'
          : 'unavailable',
      workspace_context: input.workspaceId ? 'available' : 'unsupported',
      agentic_harness: !isAgentic
        ? 'unsupported'
        : input.ioHarnessPresent
          ? 'available'
          : 'unavailable',
      // The four LOCAL discovery tools refuse without context.ioHarness.
      workspace_intelligence: !isAgentic
        ? 'unsupported'
        : input.ioHarnessPresent
          ? 'available'
          : 'unavailable',
      // query_workspace_sources is server-side source search: it guards on
      // workspace + user only (no harness), so the workspace is its gate.
      workspace_source_search: !isAgentic
        ? 'unsupported'
        : input.workspaceId
          ? 'available'
          : 'unsupported',
    },
    connections: (input.connections ?? []).map((c) => ({
      label: c.label,
      provider: c.provider,
      status: connectionStatus(c),
    })),
  };
}

/**
 * Derive the prepared-path manifest inputs from the SAME effective read
 * enforcement retrieval uses (#440 review finding 2 — the manifest must never
 * advertise a read the enforcement layer will not perform). Pure function
 * over the extracted enforcement layer (lib/context/readEnforcement.ts).
 */
export function derivePreparedCapabilityInputs(
  args: Pick<PreparedContextOptions, 'disableExternalContext' | 'skipWebResearch'> & {
    plan?: PreparedContextPlan | null;
  },
): { webResearchEnabled: boolean; memoryReadEnabled: boolean } {
  const normalizedPlan = normalizePreparedContextPlan(args.plan ?? undefined);
  const enforcement = buildReadEnforcement(normalizedPlan, {
    disableExternalContext: args.disableExternalContext,
    skipWebResearch: args.skipWebResearch,
  });
  return {
    webResearchEnabled: enforcement.researchReadAllowed,
    // Every IMPLEMENTED memory read counts: prepareContextBundle retrieves
    // graph context under graphReadAllowed (allowGraphRecall), independently
    // of the conversation/workspace/userProfile gates — a graph-only plan
    // retrieves stored context and must not read as memory-unavailable
    // (#440 review round 4).
    memoryReadEnabled:
      enforcement.conversationMemoryReadAllowed ||
      enforcement.workspaceMemoryReadAllowed ||
      enforcement.userProfileReadAllowed ||
      enforcement.graphReadAllowed,
  };
}

// Distinct wording per capability per status (#440 review finding 3: unknown,
// unavailable and unsupported must never render identically).
const CAPABILITY_LINES: Record<CapabilityId, Record<CapabilityStatus, string>> = {
  background_web_research: {
    available:
      '- Web research: available — the system may search the live internet for you (results appear as "Web Search Results", or through the web_search tool).',
    unavailable:
      '- Web research: not available in this session. Do not claim to have searched the internet.',
    unsupported: '- Web research: not supported in this runtime mode.',
    unknown:
      '- Web research: availability unverified for this session. Do not assume access either way.',
  },
  long_term_memory: {
    available:
      '- Long-term memory: available. "User Profile" and "Relevant Previous Work" sections in your context mean the system retrieved stored context for you.',
    unavailable:
      '- Long-term memory: not available in this session. Stored context is not being retrieved; do not claim to remember prior work.',
    unsupported: '- Long-term memory: not supported in this runtime mode.',
    unknown:
      '- Long-term memory: availability unverified for this session. Do not assume either way.',
  },
  workspace_context: {
    available:
      '- Workspace context: a workspace is selected for this conversation; workspace-scoped documents and sources may appear in your context.',
    unavailable: '- Workspace context: not available in this session.',
    unsupported: '- Workspace context: no workspace is selected for this conversation.',
    unknown: '- Workspace context: availability unverified for this session.',
  },
  agentic_harness: {
    available:
      '- Agentic tool use: this session runs with the file and execution tools the system has registered.',
    unavailable:
      '- Agentic tool use: not available in this session (no execution harness connected).',
    unsupported: '- Agentic tool use: not supported in this runtime mode.',
    unknown: '- Agentic tool use: availability unverified for this session.',
  },
  workspace_intelligence: {
    available:
      '- Workspace intelligence (local document discovery): available through registered tools.',
    unavailable:
      '- Workspace intelligence (local document discovery): not available in this session (no execution harness connected).',
    unsupported: '- Workspace intelligence: not supported in this runtime mode.',
    unknown: '- Workspace intelligence: availability unverified for this session.',
  },
  workspace_source_search: {
    available:
      '- Workspace source search: available through the query_workspace_sources tool (your workspace knowledge base).',
    unavailable: '- Workspace source search: not available in this session.',
    unsupported: '- Workspace source search: not supported — no workspace is selected for this conversation, or this runtime mode does not carry the tool.',
    unknown: '- Workspace source search: availability unverified for this session.',
  },
};

function renderCapabilityLines(manifest: CapabilityManifest): string[] {
  return (Object.keys(CAPABILITY_LINES) as CapabilityId[]).map(
    (id) => CAPABILITY_LINES[id][manifest.capabilities[id]],
  );
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
 * Record capability resolution + exposed tool names with request correlation
 * (#440 review finding 5: requestId/conversationId so a reported response can
 * be attributed directly). Fire-and-forget: telemetry must never fail the
 * request or the worker run.
 */
export async function logCapabilityResolution(args: {
  userId?: string;
  workspaceId?: string;
  requestId?: string;
  conversationId?: string;
  manifest: CapabilityManifest;
  toolNames: string[];
}): Promise<void> {
  try {
    const { logEvent } = await import('@/lib/telemetry');
    logEvent({
      eventType: 'capability_manifest_resolved',
      userId: args.userId,
      workspaceId: args.workspaceId,
      metadata: {
        requestId: args.requestId ?? 'unknown',
        conversationId: args.conversationId ?? null,
        surface: args.manifest.surface,
        resolvedMode: args.manifest.resolvedMode,
        workspaceId: args.manifest.workspaceId,
        capabilities: args.manifest.capabilities,
        connections: args.manifest.connections,
        toolNames: args.toolNames,
      },
    });
  } catch {
    // telemetry is best-effort by contract
  }
}
