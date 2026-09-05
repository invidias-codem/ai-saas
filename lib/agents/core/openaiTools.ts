import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "./types";
import type { NimToolSpec, NimToolChoice } from "@/lib/llm/toolCallTypes";

/**
 * Tool-schema normalization for OpenAI-compatible providers (NVIDIA NIM /
 * vLLM). Converts a `Tool`'s Zod contract into a strict JSON Schema parameters
 * object that vLLM/NIM accept without parser-hint / strict-mode mismatches.
 *
 * Use `zod-to-json-schema` (not the hand-rolled `zodToGeminiParameters`) because
 * it correctly handles nested arrays, unions, enums, and optional fields — the
 * exact strict-format requirements NIM enforces.
 */

/** Convert one Tool into an OpenAI `tools[]` entry. */
export function zodToOpenAIToolSpec(tool: Tool): NimToolSpec {
  // zodToJsonSchema emits an object with $ref/$schema wrappers in some modes;
  // force a clean, self-contained JSON Schema with no external refs.
  const parameters = zodToJsonSchema(tool.schema, {
    target: "openApi3",
    $refStrategy: "none",
    name: tool.name,
  }) as Record<string, unknown>;

  // Strip top-level `$schema` / `title` noise some vLLM builds reject; keep a
  // deterministic `type: object` shape.
  const clean: Record<string, unknown> = {};
  if (parameters.type) clean.type = parameters.type;
  if (parameters.properties) clean.properties = parameters.properties;
  if (Array.isArray(parameters.required)) clean.required = parameters.required;
  if (parameters.additionalProperties !== undefined) clean.additionalProperties = parameters.additionalProperties;

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: clean,
    },
  };
}

/** Convert the full registry into an OpenAI `tools[]` array. */
export function zodToOpenAITools(tools: Tool[]): NimToolSpec[] {
  return tools.map(zodToOpenAIToolSpec);
}

/**
 * Build a `tool_choice` value. NIM/vLLM accept `"auto"`, `"none"`, or a named
 * `{ type:"function", function:{ name } }`. Default is `"auto"`.
 */
export function buildToolChoice(
  toolName?: string,
): NimToolChoice {
  if (!toolName) return "auto";
  if (toolName === "none") return "none";
  return { type: "function", function: { name: toolName } };
}