import { task, tasks } from "@trigger.dev/sdk";

/**
 * Multi-step subtask orchestration.
 *
 * Fans out independent tool-call steps across parallel durable subtasks and
 * waits for the full set — the mechanism for decomposing a single long agent
 * run into N bounded units, each with its own retry/idempotency and none
 * subject to a single serverless timeout ceiling.
 */

export const planSubtask = task({
  id: "plan-subtask",
  retry: { maxAttempts: 3 },
  run: async (payload: { step: string; parentRunId: string }) => {
    // Single tool-step executor — placeholder for real tool dispatch.
    // Wire to a per-step tool runner (registry re-hydration + execute) in a
    // follow-up that threads real tool execution through here.
    return { step: payload.step, ok: true };
  },
});

export const orchestrateSubtasks = task({
  id: "orchestrate-subtasks",
  run: async (payload: { parentRunId: string; steps: string[] }) => {
    // Golden rule: never wrap triggerAndWait / batchTriggerAndWait in
    // Promise.all — use the batch API, which is concurrency-safe and resumes
    // cleanly. A single batchTriggerAndWait call fans out all steps and returns
    // a strongly-typed aggregate result.
    const results = await tasks.batchTriggerAndWait("plan-subtask", [
      ...payload.steps.map((step, i) => ({
        payload: { step, parentRunId: `${payload.parentRunId}#${i}` },
      })),
    ]);
    return results;
  },
});