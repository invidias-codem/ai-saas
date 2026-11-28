# Inline Media Rendering Pipeline — spec

## Goal
Render media-tool results (generate_music / generate_image / generate_video) as live
interactive components (audio player, video stream, image grid) INSIDE the chat message
bubble, instead of as JSON/prose tool text.

## Grounded findings (from recon)

1. Tool results carry machine-readable data — but it never reaches the client in a
   parseable form. `runReActLoop` stores each tool's output in
   `trajectory[].observation.data` (my `{predictionId, pollUrl, images}`), and the
   agentic branch of `conversationEngine.ts` enqueues a final
   `donePayload = {status, answer, trajectory}` as a JSON blob on the SSE stream
   (line ~424-429). The client reads the stream as raw text and never parses it.

2. The streaming model is mixed:
   - Agentic path: `onStep` thought text is streamed as plain events; the FINAL answer
     arrives all-at-once in `donePayload` (the ReAct loop is awaited, then streamed).
   - Non-agentic path: true token streaming (the chat parser appends chunks).

3. Reusable primitives already exist (built in this session):
   - `useMediaGeneration` (async POST + 3s poll state machine) — M4
   - `GenerationStates` (`GenerationLoading`/`GenerationError`/`GenerationEmpty`) — M5
   - `components/media/config` + `types` — M1

## The prerequisite plumbing task (before any renderer)

Teach the stream to surface structured tool results. Two viable approaches:

- **A. Trajectory payload** — parse `donePayload.trajectory`, extract
  `observation.data` for media tool steps, attach as a structured "media" field on the
  final bot message. (Minimal server change; trajectory is already on the wire.)
- **B. Explicit media envelope** — have `generateMusicTool`/etc. return a distinct
  `{ _media: {...} }` marker that the engine detects and emits as a separate structured
  stream event / header. (Cleaner contract, but touches the tool + engine + client prose
  handling.)

Recommendation: **A first** (smallest change, trajectory already serialized), with the
endpoint `pollUrl` letting the client re-enter via `useMediaGeneration`-style polling.

## Renderer slices

- [ ] IR1 — stream parsing: in `useChatStream`/`client.tsx`, parse the final `donePayload`
      blob, extract media tool results into a structured `mediaArtifacts` array on the
      Message (image URLs / predictionId+pollUrl).
- [ ] IR2 — `InlineMediaCard` component: given a media artifact, render
      image grid (direct) OR video/audio (poll via `useMediaGeneration` + `GenerationStates`
      with accent). Reuses M4/M5.
- [ ] IR3 — message renderer integration: render `InlineMediaCard` inside the bot bubble
      for messages carrying `mediaArtifacts`, preserving the existing text alongside.
- [ ] IR4 — approval UX: since tools are `requiresApproval: true`, ensure the
      `halted_for_approval` path surfaces a confirm affordance in-chat (ties to the existing
      `pendingApproval`/`GitHubConsentModal` precedent).

## Out of scope (for now)
- Live token-streaming of media progress inside the conversation (current model is
  all-at-once final answer + poll).
- Cross-device persistence of inline media artifacts (depends on message schema).