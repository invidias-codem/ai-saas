# AI Agent Guidelines

This project uses AI-assisted development with structured guidance in the `ai/` directory.

## Directory Structure

Agents should examine the `ai/*` directory listings to understand the available commands, rules, and workflows.

## Index Files

Each folder in the `ai/` directory contains an `index.md` file that describes the purpose and contents of that folder. Agents can read these index files to learn the function of files in each folder without needing to read every file.

**Important:** The `ai/**/index.md` files are auto-generated from frontmatter. Do not create or edit these files manually—they will be overwritten by the pre-commit hook.

## Progressive Discovery

Agents should only consume the root index until they need subfolder contents. For example:
- If the project is Python, there is no need to read JavaScript-specific folders
- If working on backend logic, frontend UI folders can be skipped
- Only drill into subfolders when the task requires that specific domain knowledge

This approach minimizes context consumption and keeps agent responses focused.

## Vision Document Requirement

**Before creating or running any task, agents must first read the vision document (`vision.md`) in the project root.**

The vision document serves as the source of truth for:
- Project goals and objectives
- Key constraints and non-negotiables
- Architectural decisions and rationale
- User experience principles
- Success criteria

## Conflict Resolution

If any conflicts are detected between a requested task and the vision document, agents must:

1. Stop and identify the specific conflict
2. Explain how the task conflicts with the stated vision
3. Ask the user to clarify how to resolve the conflict before proceeding

Never proceed with a task that contradicts the vision without explicit user approval.

## Custom Skills and Configuration

Project-specific customization lives in `aidd-custom/`. Before starting work,
read `aidd-custom/index.md` to discover available project-specific skills,
and read `aidd-custom/config.yml` to load configuration into context.

## Architectural Invariants (Dashboard surfaces)

All routes under `app/[locale]/(dashboard)/` follow this pattern:
- `page.tsx` is an async Server Component: `auth()` gate + parallel server
  data prefetch via `lib/` helpers. Never `'use client'` in `page.tsx` unless it
  is a pure redirect (and prefer server `redirect()` for that too).
- Interactivity lives in co-located client islands (`*Section.tsx`,
  `*Manager.tsx`, `*Monitor.tsx`) that receive initial data as props.
- Client islands never fetch on mount for data the server could provide.
  Post-hydration fetching is reserved for: user mutations, background polling
  (SWR), and targeted invalidation.
- Cross-surface conversation freshness uses the `'conversations:invalidate'`
  CustomEvent bus (lib: `components/conversation-history.tsx`), not
  pathname-effect refetches.
- `useSearchParams` in a client component MUST be wrapped in `<Suspense>`.
- Conversation access control is scoped by `(id, user_id)` via
  `lib/conversations/routing.ts` — never query by id alone with `supabaseAdmin`.
- New conversations always stamp `workspace_id` + `operating_profile_id`, created
  via `/conversation/new` (fat route handler) or `workspaces/[id]/conversation`
  (`?action=new` bypasses last-open restore).
