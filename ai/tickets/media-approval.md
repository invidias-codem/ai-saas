# Media Tool Approval (human-in-the-loop) — spec

## Problem (grounded recon)
The approval foundation is broken/missing:
1. `registry.ts:142` hard-rejects every `risk: 'mutative'` tool for `userRole !== 'admin'`,
   but `userRole` is never hydrated in `agentContext` → always `undefined` → all mutative
   tools (media AND existing harness write/execute) are blocked for everyone.
2. `requiresApproval` is checked AFTER that gate, so normal users never reach it.
3. There is no approval-resume protocol: `reactLoop.ts` returns `halted_for_approval` (or
   `ToolResult.userApprovalNeeded`) and ENDS the loop. No `approvalId`/resume path exists.

## Step 1 — Fix the role gate (registry.ts)
- Hydrate `userRole` (default `'user'`, `'admin'` for admins) into `agentContext` in
  `conversationEngine.ts`.
- Decouple the mutative risk gate from `requiresApproval`: a mutative tool with
  `requiresApproval: true` routes to the human-in-the-loop pause regardless of role.
  The `userRole !== 'admin'` hard-reject now applies only to mutative tools that do NOT
  opt into approval.

## Step 2 — Approval-token + resume protocol (server)
- `lib/agents/core/approvalStore.ts`: ephemeral in-memory `Map<approvalId, PausedTool>`
  (toolName, input, context, createdAt) with TTL.
- `reactLoop.ts`: on `ToolResult.userApprovalNeeded`, issue an `approvalId`, persist the
  paused tool, emit `__APPROVAL_EVENT__{approvalId, tool, params}` via an `onApproval`
  callback, and yield.
- `conversationEngine.ts`: surface `__APPROVAL_EVENT__` on the stream like `_media`.
- `/api/chat` (or a dedicated `/api/approval/resume` route): accept `{approvalId, approved}`.
  `approved:true` → look up the paused tool, execute it directly (bypassing the approval
  gate), return the tool result (which flows back as a `_media` envelope if applicable).
  `approved:false` → return a cancellation marker without executing.

## Step 3 — UI (deferred until Step 1+2 are tsc-green)
- `useChatStream.ts`: parse `__APPROVAL_EVENT__`, attach `approvalRequest` to the message.
- `MediaApprovalCard.tsx`: confirm/cancel buttons → POST approve/deny → seamless
  `InlineMediaCard` transition.

## Explicitly deferred (post-Step-2)
- True "resume the ReAct loop mid-trajectory" (re-entering the multi-step planning loop).
  Step 2 resumes the *paused tool* (single-step) — sufficient for media, which is a single
  mutative tool call.