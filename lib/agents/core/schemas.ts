import { z } from "zod";

// 1. The Global Swarm State
// This is the internal state machine object (not directly output by the LLMs)
export const SwarmStateSchema = z.object({
  originalQuery: z.string(),
  workspaceId: z.string(),
  episodicContext: z.array(z.string()),
  discoveredFiles: z.array(
    z.object({
      path: z.string(),
      summary: z.string(),
      content: z.string(), // The actual string content fetched by the Researcher
    })
  ),
  proposedMutations: z.array(
    z.object({
      path: z.string(),
      diff: z.string(), // unified diff format
    })
  ),
  currentStatus: z.enum(["researching", "coding", "reviewing", "complete", "failed"]),
  handoffNotes: z.string(),
  iterationCount: z.number().default(0),
  actionLedger: z.array(z.string()).default([]),
});
export type SwarmState = z.infer<typeof SwarmStateSchema>;

// 2. The Researcher's Output Schema
// Strictly controls what the Researcher can hand off to the Orchestrator
export const ResearcherHandoffSchema = z.strictObject({
  status: z.enum(["coding", "failed"]).describe("Set to 'coding' if files were found, 'failed' if the intent cannot be fulfilled."),
  discoveredFiles: z.array(
    z.strictObject({
      path: z.string().describe("The exact relative path of the local file."),
      summary: z.string().describe("A concise summary of why this file is relevant to the required code changes."),
    })
  ).describe("The list of files the Coder will need to mutate or understand. Do NOT include standard library or package.json files unless explicitly requested."),
  handoffNotes: z.string().describe("Explicit instructions to the Coder detailing exactly what needs to be changed and why, referencing the discovered files."),
});

// 3. The Coder's Output Schema
// The Coder is a pure function. It reads `discoveredFiles` and outputs `proposedMutations`.
export const CoderHandoffSchema = z.strictObject({
  status: z.enum(["reviewing", "failed"]).describe("Set to 'reviewing' if mutations are ready, 'failed' if the logic is impossible given the constraints."),
  proposedMutations: z.array(
    z.strictObject({
      path: z.string().describe("The path of the file to mutate."),
      diff: z.string().describe("The unified diff representing the exact code changes to apply."),
    })
  ).describe("The strict list of file mutations. Do NOT hallucinate paths that were not provided in the discoveredFiles array."),
  handoffNotes: z.string().describe("Notes for the Reviewer explaining the implementation details and what edge cases to test for."),
});

// 4. The Reviewer's Output Schema
// The Reviewer runs tests via the Go daemon and yields the final verdict.
export const ReviewerHandoffSchema = z.strictObject({
  status: z.enum(["complete", "researching", "failed"]).describe("Set to 'complete' if tests pass, 'researching' to kick it back down the DAG for a retry, or 'failed' to abort completely."),
  reviewLog: z.string().describe("The summary of test executions, linting results, or visual verifications."),
  handoffNotes: z.string().describe("If 'complete', a summary for the user. If 'researching', explicit details on what the Coder broke so the Researcher can start a fix loop."),
});
