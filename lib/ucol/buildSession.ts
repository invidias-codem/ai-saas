// lib/ucol/buildSession.ts
// BuildSession construction — the single place a BuildSession is assembled
// from identity. Used by both the SSE route (per-request) and the durable
// worker (per-task), so the session shape stays consistent.
//
// Phase 2 reconstructability contract:
//   RECONSTRUCTABLE (serially derivable from buildId/requestId/userId/prompt):
//     id, userId, userPrompt, plan (after planning), files (after codegen).
//   EPHEMERAL (accumulated during a single run; NOT reconstructable on re-entry):
//     reviewRounds, constraintRounds, discoveredPatterns, refinementLog,
//     contextFlow. These are per-run accumulators. A retried/replayed task
//     starts them fresh — a future Phase (durable build-state persistence)
//     must persist them if resume-after-crash must retain review history.
//
// The engine currently mutates `session` in place for the ephemeral fields.
// That is safe as long as the session is created exactly once per run AND a
// replay starts from a fresh session (which makeBuildSession guarantees). It
// becomes unsafe only if a half-run session is reused across Trigger attempts —
// which we do NOT do: each attempt calls makeBuildSession() anew.

import type { BuildSession } from './types';

export interface BuildSessionIdentity {
  buildId: string;
  requestId: string;
  userId: string;
  workspaceId?: string;
  userPrompt?: string;
}

export function makeBuildSession(identity: BuildSessionIdentity): BuildSession {
  return {
    id: identity.buildId,
    userId: identity.userId,
    userPrompt: identity.userPrompt,
    files: [],
    contextFlow: [],
    reviewRounds: 0,
    constraintRounds: 0,
    discoveredPatterns: [],
    refinementLog: [],
    // workspaceId is not a BuildSession field (see types.ts); retained in the
    // identity tuple for future durable persistence. requestId is correlation
    // only — buildId is the session/business identity.
  };
}