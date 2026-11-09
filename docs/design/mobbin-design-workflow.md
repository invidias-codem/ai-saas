# Mobbin → Lattice Design Research (Phase D0)

**Status:** Project-scoped agent MCP registration and optional Code Builder
design-brief intake implemented. **Not** a Lattice customer-facing Mobbin
OAuth connection, live design search UI, or a library of copied references.

## Purpose

Design reference research should improve Lattice's originality and usability:
workspace navigation, Code Builder, preview, agent observability, mobile settings,
team onboarding and publication flows. Higgsfield is a quality benchmark for
canvas-first experiences, not a template to copy.

## Connection and permissions

- The official first-party endpoint is `https://api.mobbin.com/mcp`,
  Streamable HTTP. This repo registers it for clients that honor `.mcp.json`.
- Preferred when supported: the official Mobbin plugin/skill for the user's
  particular agent client; manual MCP-only configuration lacks Mobbin's
  bundled design skills.
- Each designer/developer connects with **their own** Mobbin account via
  browser OAuth (Pro/Team/Enterprise as applicable). Neither personal tokens
  nor shared Mobbin credentials belong in this repository.
- Useful read calls: `search_screens`, `search_flows`, `search_sections`.
  Collection writes and comments need separate user approval.
- The URL `https://mobbin.com/fireship` redirects to a Mobbin referral
  registration page; it is not an API endpoint.

## Workflow

1. Define a target screen or user flow, outcome, audience and constraints.
2. Authenticated agent compares 3–5 relevant Mobbin references when available.
3. Abstract the transferable *principles* of their information hierarchy,
   progressive disclosure, navigation, visual feedback and mobile ergonomics.
4. Produce a small design brief with provenance URLs, observations and
   original Lattice applications. **Never** include Mobbin image bytes,
   screenshot URLs, HTML, source assets or copied UI/text in saved briefs.
5. Pass the validated brief as optional `contextPackage.payload.content.designBrief`
   to Code Builder's `generatePlan` call. The planner uses the brief to improve
   component and page specifications while preserving Lattice's visual identity.
6. Review output for originality, keyboard behavior, responsive 320px layouts,
   accessible contrast, empty/error/loading states and reduced motion.

## Licensing and security controls

Mobbin Terms of Service (May 16 2026) permit certain personal/internal business
and proprietary product API/MCP integrations, but restrict content copying,
derivatives, mirroring, redistribution, third-party sublicensing, and AI
training/indexing. This workflow only stores canonical source links and
independently written abstract pattern observations. Treat remote results as
untrusted input; the planner has no authority to call Mobbin or run instructions
returned by references. Confirm contractual approval before exposing Mobbin
reference searches directly to Lattice's customers or embedding third-party
screens in apps. See https://mobbin.com/terms.

## Follow-up slices

- **D1** User-scoped OAuth/MCP provider adapter, with encrypted per-user tokens,
  server-verified capability status and explicit workspace permission gates.
- **D2** Design Research action in Code Builder and conversational workspaces,
  yielding a bounded original design brief (not a screenshot collection).
- **D3** Mobile/desktop design review board sourced from approved reference links
  and Lattice-owned generated screenshots; accessibility evaluation and
  human approval before PR/publication.

No flag, runtime provider key, production RLS policy, or customer account is
changed by D0. Do not misrepresent an unconnected MCP as live research.

Sources:
- https://mobbin.com/mcp
- https://docs.mobbin.com/mcp/features
- https://github.com/mobbin/skills
- https://mobbin.com/terms
- https://higgsfield.ai/canvas-intro
