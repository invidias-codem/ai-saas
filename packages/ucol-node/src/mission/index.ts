/**
 * @file mission/index.ts
 * @description Mission lifecycle state machine — spec §6.2.
 *
 * Mission state transitions:
 * PENDING → PLANNING → READY → EXECUTING → REVIEWING → COMPLETE/FAILED/CANCELLED
 * EXECUTING → PAUSED → EXECUTING (human gate)
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Mission,
  MissionSpec,
  MissionState,
  MissionStep,
  StepResult,
  UUID,
} from '../store/schema.js';

/** Valid state transitions per spec §6.2 */
const VALID_TRANSITIONS: Record<MissionState, MissionState[]> = {
  PENDING: ['PLANNING'],
  PLANNING: ['READY', 'FAILED'],
  READY: ['EXECUTING'],
  EXECUTING: ['REVIEWING', 'PAUSED', 'FAILED'],
  REVIEWING: ['COMPLETE', 'EXECUTING', 'FAILED'],
  PAUSED: ['EXECUTING', 'CANCELLED'],
  COMPLETE: [],
  FAILED: [],
  CANCELLED: [],
};

/** Terminal states — no further transitions allowed */
const TERMINAL_STATES: MissionState[] = ['COMPLETE', 'FAILED', 'CANCELLED'];

/**
 * MissionManager — manages Mission lifecycle state machine.
 *
 * Agents communicate exclusively via the knowledge graph (spec §6 constraint).
 * No direct agent-to-agent messaging.
 */
export class MissionManager {
  /** In-memory mission store */
  private readonly missions: Map<UUID, Mission> = new Map();

  /**
   * Create a new Mission from a spec.
   * Initial state: PENDING → PLANNING (on create).
   *
   * @param spec - MissionSpec
   * @returns Created Mission with mission_id
   */
  create(spec: MissionSpec): Mission {
    const missionId = uuidv4();
    const now = new Date().toISOString();

    // Assign step_ids if not provided
    const stepsWithIds: MissionStep[] = spec.steps.map((step) => ({
      ...step,
      step_id: step.step_id ?? uuidv4(),
    }));

    const specWithIds: MissionSpec = { ...spec, steps: stepsWithIds };

    const mission: Mission = {
      mission_id: missionId,
      spec: specWithIds,
      state: 'PENDING',
      created_at: now,
      updated_at: now,
      step_results: {},
    };

    this.missions.set(missionId, mission);

    // Auto-transition: PENDING → PLANNING on create
    this.transition(missionId, 'PLANNING');

    return this.missions.get(missionId)!;
  }

  /**
   * Validate a mission spec and transition to READY or FAILED.
   *
   * Validates:
   * 1. All agent_ids are resolved (non-empty DIDs)
   * 2. No circular dependencies in step DAG
   *
   * @param missionId - Mission UUID
   * @returns true if validation passed (READY), false if FAILED
   */
  validate(missionId: UUID): boolean {
    const mission = this.getMission(missionId);
    if (!mission) return false;

    // Check all agent_ids
    const allAgentIds = new Set(mission.spec.agents);
    for (const step of mission.spec.steps) {
      if (!allAgentIds.has(step.agent_id)) {
        this.failMission(missionId, `Agent '${step.agent_id}' not in mission agent list`);
        return false;
      }
    }

    // Check for circular dependencies
    if (this.hasCircularDeps(mission.spec.steps)) {
      this.failMission(missionId, 'Circular dependency detected in mission steps');
      return false;
    }

    this.transition(missionId, 'READY');
    return true;
  }

  /**
   * Start mission execution — READY → EXECUTING.
   *
   * @param missionId - Mission UUID
   * @returns true if started successfully
   */
  start(missionId: UUID): boolean {
    return this.transition(missionId, 'EXECUTING');
  }

  /**
   * Mark a step as complete and update step results.
   * If all steps are complete, transition to REVIEWING.
   *
   * @param missionId - Mission UUID
   * @param stepId - Step UUID that completed
   * @param success - Whether the step succeeded
   * @param error - Error message if failed
   */
  completeStep(
    missionId: UUID,
    stepId: UUID,
    success: boolean,
    error?: string
  ): void {
    const mission = this.getMission(missionId);
    if (!mission) return;

    const now = new Date().toISOString();
    const stepResult: StepResult = {
      step_id: stepId,
      state: success ? 'COMPLETE' : 'FAILED',
      completed_at: now,
      error,
    };

    mission.step_results[stepId] = stepResult;
    mission.updated_at = now;

    // Check failure policy
    if (!success) {
      switch (mission.spec.on_failure) {
        case 'ABORT_ALL':
          this.failMission(missionId, `Step '${stepId}' failed: ${error ?? 'unknown'}`);
          return;
        case 'HUMAN_ESCALATE':
          this.transition(missionId, 'PAUSED');
          return;
        case 'SKIP_AND_CONTINUE':
          stepResult.state = 'SKIPPED';
          break;
      }
    }

    // Check if all steps are complete/skipped
    const allStepIds = mission.spec.steps.map((s) => s.step_id ?? '').filter(Boolean);
    const allDone = allStepIds.every((id) => {
      const result = mission.step_results[id];
      return result?.state === 'COMPLETE' || result?.state === 'SKIPPED';
    });

    if (allDone) {
      this.transition(missionId, 'REVIEWING');
    }
  }

  /**
   * Complete reviewing and finalize the mission.
   * REVIEWING → COMPLETE (if approved) or EXECUTING (if revision requested).
   *
   * @param missionId - Mission UUID
   * @param approved - Whether the review passed
   */
  review(missionId: UUID, approved: boolean): void {
    if (approved) {
      this.transition(missionId, 'COMPLETE');
    } else {
      this.transition(missionId, 'EXECUTING');
    }
  }

  /**
   * Pause a mission for human review.
   * EXECUTING → PAUSED.
   *
   * @param missionId - Mission UUID
   */
  pause(missionId: UUID): void {
    this.transition(missionId, 'PAUSED');
  }

  /**
   * Resume a paused mission after human approval.
   * PAUSED → EXECUTING.
   *
   * @param missionId - Mission UUID
   * @returns true if resumed successfully
   */
  resume(missionId: UUID): boolean {
    return this.transition(missionId, 'EXECUTING');
  }

  /**
   * Cancel a paused mission.
   * PAUSED → CANCELLED.
   *
   * @param missionId - Mission UUID
   * @param reason - Cancellation reason
   */
  cancel(missionId: UUID, reason: string): void {
    const mission = this.getMission(missionId);
    if (!mission) return;
    mission.failure_reason = reason;
    this.transition(missionId, 'CANCELLED');
  }

  /**
   * Get mission status.
   *
   * @param missionId - Mission UUID
   * @returns Mission or null
   */
  getMission(missionId: UUID): Mission | null {
    return this.missions.get(missionId) ?? null;
  }

  /**
   * List all missions (for admin/debug purposes).
   *
   * @returns All missions
   */
  listMissions(): Mission[] {
    return [...this.missions.values()];
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /** Transition a mission to a new state */
  private transition(missionId: UUID, nextState: MissionState): boolean {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    const allowed = VALID_TRANSITIONS[mission.state];
    if (!allowed.includes(nextState)) {
      return false;
    }

    mission.state = nextState;
    mission.updated_at = new Date().toISOString();

    if (TERMINAL_STATES.includes(nextState)) {
      mission.completed_at = mission.updated_at;
    }

    this.missions.set(missionId, mission);
    return true;
  }

  /** Fail a mission with a reason */
  private failMission(missionId: UUID, reason: string): void {
    const mission = this.missions.get(missionId);
    if (!mission) return;
    mission.failure_reason = reason;
    this.transition(missionId, 'FAILED');
  }

  /**
   * Detect circular dependencies in a step DAG.
   * Uses DFS with coloring (white/gray/black).
   */
  private hasCircularDeps(steps: MissionStep[]): boolean {
    const idMap = new Map<string, MissionStep>();
    for (const step of steps) {
      if (step.step_id) idMap.set(step.step_id, step);
    }

    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();

    for (const id of idMap.keys()) {
      color.set(id, WHITE);
    }

    const hasCycle = (nodeId: string): boolean => {
      color.set(nodeId, GRAY);
      const node = idMap.get(nodeId);
      for (const depId of node?.depends_on ?? []) {
        if (color.get(depId) === GRAY) return true;
        if (color.get(depId) === WHITE && hasCycle(depId)) return true;
      }
      color.set(nodeId, BLACK);
      return false;
    };

    for (const id of idMap.keys()) {
      if (color.get(id) === WHITE && hasCycle(id)) return true;
    }

    return false;
  }
}
