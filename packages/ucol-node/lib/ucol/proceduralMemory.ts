/**
 * @file lib/ucol/proceduralMemory.ts
 * @description Stub/re-export of ProceduralMemory for the ucol-node package.
 *
 * In the monorepo, this delegates to the existing lib/ucol/proceduralMemory
 * at the project root. When used as a standalone package, it provides a
 * no-op implementation that always returns null (fast-path disabled).
 */

export interface ToolStep {
  tool: string;
  command: string;
  args: string[];
  expectedOutputShape?: Record<string, unknown>;
}

export interface ProceduralRecord {
  id: string;
  userId: string;
  taskType: string;
  taskDescription: string;
  toolSequence: ToolStep[];
  successCount: number;
  failureCount: number;
  confidence: number;
  avgLatencyMs: number;
  promotedAt: string | null;
  lastUsedAt: string;
}

export interface ProceduralMatch {
  record: ProceduralRecord;
  similarity: number;
  /** True when successCount >= 3 AND confidence >= 0.85 AND promoted_at is set */
  isStableMacro: boolean;
}

/**
 * Find a procedural memory match for the given agent and query.
 *
 * @param _agentId - Agent DID
 * @param _query - Natural language query
 * @returns ProceduralMatch if a stable macro exists with similarity >= 0.92, else null
 */
export async function findProceduralMatch(
  _agentId: string,
  _query: string
): Promise<ProceduralMatch | null> {
  // Standalone stub — always returns null (fast-path disabled)
  // In the monorepo, this would delegate to the real implementation
  return null;
}

/**
 * Record a task execution outcome for future fast-path learning.
 *
 * @param _agentId - Agent DID
 * @param _query - Natural language query
 * @param _taskType - Classified task type
 * @param _toolSequence - Tool steps executed
 * @param _success - Whether execution succeeded
 */
export async function recordExecution(
  _agentId: string,
  _query: string,
  _taskType: string,
  _toolSequence: ToolStep[],
  _success: boolean
): Promise<void> {
  // Standalone stub — no-op
}

export default { findProceduralMatch, recordExecution };
