/**
 * Governance Runtime Resolver — Phase 2.1 (DECIDED 2026-07-12).
 *
 * Three-tier design (per docs/sovereign-ai-telemetry-implementation.md §2.1):
 *   1. Core storage: Supabase `agent_governance_policies`
 *      (context_role -> { active_modules, disabled_modules, defense_triggers }).
 *   2. Edge resolver: resolveGovernance() fetches the policy, cross-references
 *      the active session state, evaluates with live state variables. Runs at
 *      request-packaging time so the LIVE operational config is snapshotted.
 *   3. Ephemeral cache: short-TTL in-memory + IndexedDB mirror; invalidated on
 *      session/role change. Avoids slow static lookups under adversarial stress.
 *
 * Graceful degradation: if Supabase is unavailable or the row is missing,
 * falls back to a hardcoded `public_baseline` default (PRD §3.1) so telemetry
 * emission never throws.
 */

import { supabaseAdmin } from "@/lib/supabaseClient";
import type { GovernanceState } from "./udif";

const DEFAULT_BASELINE: GovernanceState = {
  context_role: "public_baseline",
  active_modules: ["general_reasoning", "syntax_analysis"],
  disabled_modules: ["offensive_cybersecurity"],
  defense_triggers: [],
};

/** Map a resolved runtime context to a governance context_role. */
export function deriveContextRole(input: {
  workspaceId?: string | null;
  operatingProfileId?: string | null;
  agentMode?: string | null;
}): string {
  if (input.workspaceId) return `workspace:${input.workspaceId}`;
  if (input.operatingProfileId) return `profile:${input.operatingProfileId}`;
  return "public_baseline";
}

interface CacheEntry {
  state: GovernanceState;
  expires: number;
}

const TTL_MS = 30_000; // 30s ephemeral cache
const memoryCache = new Map<string, CacheEntry>();

/** Read the cached entry (in-memory). IndexedDB mirror handled client-side. */
function readCache(role: string): GovernanceState | null {
  const hit = memoryCache.get(role);
  if (hit && hit.expires > Date.now()) return hit.state;
  memoryCache.delete(role);
  return null;
}

function writeCache(role: string, state: GovernanceState): void {
  memoryCache.set(role, { state, expires: Date.now() + TTL_MS });
}

/** Invalidate cache for a role (call on session/role change). */
export function invalidateGovernanceCache(role?: string): void {
  if (role) memoryCache.delete(role);
  else memoryCache.clear();
}

export interface ResolveGovernanceInput {
  contextRole: string;
  /** Active session state (userId, workspaceId, mode, etc.). */
  sessionState?: Record<string, unknown>;
  /** Live, operational state variables (module health, stress signals). */
  liveVars?: Record<string, unknown>;
}

/**
 * Resolve the effective governance snapshot for a context role.
 * Returns the cached/migrated state, or the public_baseline default on any
 * failure. Never throws.
 */
export async function resolveGovernance(
  input: ResolveGovernanceInput
): Promise<GovernanceState> {
  const { contextRole, sessionState, liveVars } = input;

  const cached = readCache(contextRole);
  if (cached) return cached;

  try {
    if (!supabaseAdmin) {
      return DEFAULT_BASELINE;
    }
    const { data, error } = await supabaseAdmin
      .from("agent_governance_policies")
      .select("context_role, active_modules, disabled_modules, defense_triggers")
      .eq("context_role", contextRole)
      .maybeSingle();

    if (error || !data) {
      // Try the baseline if the specific role has no row yet.
      if (contextRole !== "public_baseline") {
        const baseline = await resolveGovernance({
          contextRole: "public_baseline",
          sessionState,
          liveVars,
        });
        writeCache(contextRole, baseline);
        return baseline;
      }
      return DEFAULT_BASELINE;
    }

    const state: GovernanceState = {
      context_role: data.context_role,
      active_modules: data.active_modules ?? [],
      disabled_modules: data.disabled_modules ?? [],
      defense_triggers: data.defense_triggers ?? [],
    };
    writeCache(contextRole, state);
    return state;
  } catch {
    // Any unexpected failure degrades to baseline — telemetry must not break.
    return DEFAULT_BASELINE;
  }
}
