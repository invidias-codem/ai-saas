# Workspace-First Slice Plan

## Goal
Evolve `ai-saas` from a flat AI-tools dashboard into a workspace-centric, memory-native intelligence platform that matches the landing-page promise.

## Current State
The product currently presents as:
- `/dashboard`
- `/conversation`
- `/image`
- `/video`
- `/music`
- `/code`

But the backend/platform already contains meaningful shared primitives:
- conversations
- messages
- memory_bank
- prepared context
- imports/sync
- integrations
- agent/cron infrastructure

## Product Thesis
The user should land after signup in a **default workspace**, not a generic tool grid.
That workspace should visibly connect:
- conversation
- memory
- context
- artifacts
- routing behavior

## First Slice Scope
Implement the minimum coherent workspace substrate:

1. `workspaces` table
2. `workspace_state` table
3. `workspace_id` attached to conversations
4. memory metadata support for `workspaceId`
5. starter workspace creation + listing APIs
6. starter workspace shell routes
7. conversation redirect into active/default workspace

## Core Data Model
### workspaces
- `id`
- `user_id`
- `name`
- `slug`
- `description`
- `kind` (`personal|project|research|operations|social|custom`)
- `status` (`active|archived`)
- `icon`
- `color`
- `is_default`
- `onboarding_state` (`starter|configured|active`)
- `routing_profile`
- `memory_profile`
- `created_at`
- `updated_at`
- `last_opened_at`

### workspace_state
- `workspace_id`
- `last_open_conversation_id`
- `last_open_tab`
- `pinned_memory_ids`
- `pinned_artifact_ids`
- `updated_at`

### conversations (extension)
Add:
- `workspace_id` nullable initially, backfilled to default workspace per user

## API Plan
### New APIs
- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/default`

### Existing API adjustments
- `/api/conversations/new` accepts optional `workspaceId`
- `/api/conversations` returns `workspaceId`
- `/api/conversations/[id]` returns `workspaceId`

## UI/Route Plan
### New routes
- `/workspaces`
- `/workspaces/[id]`
- `/workspaces/[id]/conversation`
- `/workspaces/[id]/memory`

### Transitional behavior
- `/conversation` redirects to default workspace conversation
- `/dashboard` should evolve toward workspace launcher/home

## First UX Outcome
A new signup should:
1. create default workspace
2. create starter conversation in that workspace
3. land user in workspace home or workspace conversation
4. show visible memory/context framing, not just tool cards

## Implementation Order
1. Supabase migration for `workspaces` + `workspace_state` + `conversations.workspace_id`
2. Workspace API routes
3. Backfill/default-workspace creation logic
4. Workspace shell routes/pages
5. Conversation redirect changes
6. Dashboard transition

## Notes
This slice deliberately does **not** implement the full long-term IA yet.
It establishes the minimum structural truth needed so the product can stop behaving like a generic chatbot/toolbox.
