# Lattice Agentic I/O Harness Design

## Purpose
This note refines an early draft of an agentic coding harness into a more formal Lattice-oriented design artifact.

The main objective is to preserve the right architecture principle:
- the LLM never interacts directly with the filesystem or terminal
- the model emits structured tool intent only
- a router validates and dispatches that intent
- a harness implementation performs the actual I/O

This separation is important both for local development and for a future antigravity-style isolated execution environment.

## Core Principle
The system should be split into three concerns:

1. **Tool Contracts / Types**
2. **I/O Harness Implementation**
3. **Tool Router / Dispatcher**

The implementation backend should be swappable.
The contract layer should remain stable.

## Architectural Goal
Support a future where:
- local execution uses filesystem/process APIs
- remote execution uses a sandbox/container/VM API
- the model never receives raw direct access to either

## What This Design Is For
This design is meant for:
- supervised agent/tool execution
- coding-agent workflows
- future Relay-style bounded workspace operations
- execution environments that may eventually live outside the main app process

## What This Design Is Not Yet
This is not yet:
- unrestricted shell autonomy
- a final security model for hostile code execution
- a complete sandboxing solution
- a guarantee that every command class is equally safe

It is an interface-and-boundary design for controlled execution.

---

## 1. Tool Contracts / Types Layer

## Purpose
This layer defines:
- tool names
- tool argument shapes
- result types
- validation expectations
- tool risk/policy metadata

It should be shared by both the router and any future model/tool schema injection layer.

## Why it matters
The system should avoid stringly-typed execution contracts where possible.
Structured results and typed inputs make:
- routing safer
- errors easier to reason about
- future backend swaps easier

## Recommended result shape
Instead of returning plain success/error strings, use a structured result type.

Example direction:

```ts
export type ToolExecutionResult =
  | {
      ok: true;
      output: string;
      meta?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      meta?: Record<string, unknown>;
    };
```

## Why this is better than raw strings
It allows the caller to distinguish:
- successful output
- execution failure
- validation failure
- policy denial
- truncation/timeout metadata

without parsing human text.

## Recommended tool argument validation
Tool schemas should not exist only as prompt/LLM-facing metadata.
They must also be enforced at runtime.

Preferred direction:
- `zod` or equivalent runtime validation
- a single source of truth for:
  - LLM tool definitions
  - router-side validation

---

## 2. I/O Harness Interface Layer

## Purpose
This is the abstraction boundary for actual execution.

The model should not know whether it is talking to:
- a local filesystem/process runner
- a remote antigravity sandbox
- a VM/container backend

It should only interact through validated tool calls routed into a stable harness interface.

## Recommended interface
The abstraction should be an interface first, not just one concrete class.

Example direction:

```ts
export interface IOHarness {
  readFile(filePath: string): Promise<ToolExecutionResult>;
  writeFile(filePath: string, content: string): Promise<ToolExecutionResult>;
  runCommand(command: string, timeoutMs?: number): Promise<ToolExecutionResult>;
}
```

## Why interface-first matters
This allows:
- `LocalIOHarness`
- `AntigravityIOHarness`
- future restricted or test harness variants

all behind the same contract.

## Backend-swappability principle
The main thing that should change across environments is the harness implementation.
The tool contracts and router should remain mostly stable.

That is the clean swap path.

---

## 3. Local Harness Implementation

## Purpose
A first local implementation is still useful for development, testing, and proving the interaction model.

## Minimum requirements
A local harness should include:
- workspace-root locking
- safe path resolution
- bounded command timeouts
- structured results
- output truncation policy

## Workspace locking
The harness should treat a configured base directory as the workspace root and reject path access outside it.

### Why
This prevents simple directory traversal attempts such as:
- `../../...`

### Caveat
String/path checks are helpful but are not the full final story.
A stronger future sandbox must also think about:
- symlinks
- mount behavior
- actual execution boundaries

Still, workspace locking is a correct first boundary.

## File read/write behavior
A first implementation can support:
- read file
- full overwrite write

That is acceptable as an initial capability.
Later improvements could add:
- patch/diff application
- AST-aware edits
- more granular edit primitives

## Command execution behavior
A first implementation can expose a command runner, but it must be policy-aware.

### Important caution
“Run any shell command” is too broad to treat casually.
Even if a local dev harness starts there, the architecture should acknowledge that command execution is a privileged tool.

### Recommended controls
- timeout
- output size limit
- truncation metadata
- policy/risk classification
- optional approval gates for sensitive commands

## Output handling
The harness should not allow arbitrary unbounded stdout/stderr flooding.

Recommended policy:
- capture stdout/stderr
- cap total bytes/characters
- include truncation flag in `meta`

---

## 4. Tool Router / Dispatcher Layer

## Purpose
The router is the bridge between the model’s structured intent and the harness implementation.

It should:
- expose tool definitions
- validate args at runtime
- apply policy checks
- dispatch to the harness
- return structured execution results

## What the router should own
- tool lookup
- schema validation
- tool-level policy enforcement
- logging/telemetry hooks
- dispatch behavior

## What the router should not own
- the actual filesystem/process implementation details
- direct coupling to one execution backend
- final sandboxing guarantees by itself

## Runtime validation
The router must validate arguments before calling the harness.
This is a critical difference between:
- “nice schema metadata for the model”
and
- “real execution safety”

## Policy-aware routing
The router should be able to classify tools or calls by risk.
For example:
- low-risk read
- medium-risk write
- high-risk command execution

This creates a future path for:
- approval gating
- tiered permissions
- environment-specific restrictions

---

## 5. Tool Definitions Should Be Stable Contracts

## Core idea
Tool definitions are not just prompt decorations.
They are part of the execution contract.

The same definitions should drive:
- model tool schema exposure
- runtime validation
- docs/examples
- future sandbox compatibility

## Why this matters to Lattice OS
If Lattice wants to support:
- multiple model providers
- multiple execution environments
- multiple runtime surfaces

then stable tool contracts become one of the main compatibility layers.

---

## 6. Recommended First Artifact Split
Instead of only two concrete files, the architecture should be thought of as at least three artifacts.

## Artifact A — contracts/types
Potential direction:
- `toolTypes.ts`
- `toolSchemas.ts`
- shared result types and validation schemas

## Artifact B — harness implementation
Potential direction:
- `LocalIOHarness.ts`
- later `AntigravityIOHarness.ts`

## Artifact C — router/dispatcher
Potential direction:
- `ToolRouter.ts`

This split makes the boundary clearer and the future antigravity swap cleaner.

---

## 7. Antigravity Translation Path

## Principle
When moving from local execution to a secure antigravity environment, the primary thing that should change is the harness implementation.

### Local mode
- file access via local FS APIs
- command execution via local child process APIs

### Antigravity mode
- file access via remote workspace/container APIs
- command execution via sandbox/VM/container APIs

### Stable pieces
- tool contract shapes
- router validation/dispatch behavior
- higher-level agent loop assumptions

## Better statement of the migration path
Rather than saying “only one file changes,” the more precise formulation is:

> the harness implementation is the main swappable layer, while the tool contracts and router remain stable or nearly stable.

That is the cleaner architecture promise.

---

## 8. Relationship to Lattice OS / Relay
This design is directly relevant to Lattice OS because it creates the execution boundary needed for:
- supervised agent/tool loops
- file/code workflows
- future Relay operations
- environment-specific execution backends

It supports the broader Lattice direction by making execution:
- bounded
- inspectable
- backend-agnostic
- more amenable to approval/policy controls

This is especially important if Lattice eventually wants:
- local workspace operations
- remote sandbox execution
- device-adjacent or desktop-adjacent harness behavior

---

## 9. Recommended Next Implementation Steps

## Step 1
Define stable tool result and validation contracts.

## Step 2
Define the `IOHarness` interface.

## Step 3
Build a first `LocalIOHarness` implementation with:
- workspace lock
- timeouts
- output caps
- structured results

## Step 4
Build the router with:
- validation
- dispatch
- risk-aware policy hooks

## Step 5
Only then wire the model-facing tool layer against those stable contracts.

This keeps the system honest and composable.

---

## 10. Bottom Line
The core design idea is correct:
- the model should never interact directly with the filesystem or terminal
- it should only emit structured tool intent
- a router should validate and dispatch
- a harness should execute against a controlled backend

The stronger formalization is to make this architecture:
- interface-first
- structured-result based
- runtime-validated
- policy-aware
- backend-swappable

That is the version that actually scales into Lattice OS and a future antigravity execution environment.

## Related Pages
- [agentic-harness-gap-analysis-for-lattice-os](agentic-harness-gap-analysis-for-lattice-os.md)
- [feature-context-compilation-workflow](feature-context-compilation-workflow.md)
- [lattice-os-architecture-memo-2026-05](lattice-os-architecture-memo-2026-05.md)
