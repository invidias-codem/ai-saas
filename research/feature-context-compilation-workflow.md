# Feature Context Compilation Workflow

## Purpose
This workflow formalizes a docs-first implementation method for complex feature work.

It is designed to reduce:
- hallucinated calls
- shallow patches
- missing dependency awareness
- repeated rediscovery across sessions

## Workflow
1. Select a feature entry file.
2. Recursively trace imports, utilities, endpoints, dependencies, and shared patterns.
3. Identify third-party and custom library surfaces that need documentation review.
4. Read relevant external/internal docs.
5. Generate internal implementation docs explaining:
   - how the feature works
   - important methods and return shapes
   - data flow
   - dependencies and invariants
6. Save docs in `docs/` or durable workspace knowledge with notes, examples, and Mermaid diagrams where useful.
7. Distinguish observed vs inferred behavior explicitly.
8. Add or update project guidance such as `AGENT.md` / `CLAUDE.md` / feature-local notes.
9. Have the implementation agent read those docs before coding.
10. Implement in bounded slices.
11. Verify behavior.
12. Update docs after changes.

## Expected Outputs
For a substantial feature, produce at least:
- feature overview
- dependency map
- API / method notes
- implementation notes
- diagrams
- local guidance for future agents

## Claim Tiers
Generated docs should distinguish:
- **Observed** — directly verified in source
- **External-doc-backed** — verified against provided docs
- **Inferred** — likely from usage or patterns
- **Needs verification** — unresolved or ambiguous

## Why It Matters
This workflow improves both:
- immediate coding reliability
- long-term project continuity

It is especially valuable for:
- integration-heavy features
- agent/tooling flows
- memory/routing code
- complex runtime surfaces

## Bottom Line
Before implementing a complex feature, compile its context first.
That context should become a durable artifact, not just a transient chat understanding.
