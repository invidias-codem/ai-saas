/**
 * OpenAI-compatible tool-call types — the shared contract for NIM tool-calling.
 *
 * These types survive two boundaries:
 *   1. The provider boundary (NvidiaNimProvider ↔ LLMProvider.generateStream)
 *   2. The agentic loop boundary (streamed tool_calls deltas → executed tools)
 *
 * NIM exposes a standard OpenAI-compatible `/v1/chat/completions`, so the
 * `tools` / `tool_choice` / `tool_calls` shapes are exactly the OpenAI schema.
 */

/** A single tool call as returned by the model (or accumulated from deltas). */
export interface NimToolCall {
  /** OpenAI stream index — accumulate deltas by this id. */
  id: string;
  type: "function";
  function: {
    /** Tool name; may stream in fragments, concatenate by id. */
    name: string;
    /** Arguments JSON string; may stream in fragments, concatenate by id. */
    arguments: string;
  };
}

/** A tool declaration passed in the request `tools` array. */
export interface NimToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    /** Strict JSON Schema (from zod-to-json-schema), additionalProperties:false. */
    parameters: Record<string, unknown>;
  };
}

/** `tool_choice` — "auto" | "none" (PvB — NIM vLLM handles "auto" and named). */
export type NimToolChoice =
  | "auto"
  | "none"
  | { type: "function"; function: { name: string } };

/** A single SSE chunk delta from `/chat/completions` (stream=true). */
export interface NimChatChunkDelta {
  content?: string | null;
  reasoning_content?: string | null;
  thinking?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
  finish_reason?: string | null;
}

/**
 * Accumulate streaming tool_calls deltas by index into complete NimToolCall[]
 * (concatenating name/arguments fragments — the #1 silent-breakage pitfall for
 * OpenAI-compatible providers).
 */
export function foldToolCallDeltas(
  acc: NimToolCall[],
  deltas: NimChatChunkDelta["tool_calls"],
): NimToolCall[] {
  if (!deltas?.length) return acc;

  const next = [...acc];
  for (const d of deltas) {
    if (d.index === undefined) continue;
    const slot = (next[d.index] ??= {
      id: d.id ?? "",
      type: "function",
      function: { name: "", arguments: "" },
    });
    if (d.id) slot.id = d.id;
    if (d.type) slot.type = d.type as "function";
    if (d.function?.name) slot.function.name += d.function.name;
    if (d.function?.arguments) slot.function.arguments += d.function.arguments;
  }
  return next;
}