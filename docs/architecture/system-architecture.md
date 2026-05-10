# System Architecture

## Purpose

This document provides a high-level explanation of Genie AI’s current system architecture.

It is intended to answer:
- what the major system layers are
- how requests move through the system
- where state lives
- how public, authenticated, and backend automation surfaces differ
- which architectural themes are central to the product direction

This document is a backbone architecture overview, not a full subsystem spec.

---

## High-Level View

At a broad level, Genie AI consists of five major architectural layers:

1. **Public web surface**
2. **Authenticated application surface**
3. **API and server behavior layer**
4. **Data / persistence layer**
5. **Automation / integration layer**

These layers are connected, but they serve different audiences and have different trust boundaries.

---

## 1. Public Web Surface

### What it includes
- landing pages
- public informational pages
- blog/docs/support/privacy pages
- other unauthenticated marketing or informational surfaces

### Responsibilities
- explain the product
- support discovery
- provide public documentation and support entry points
- route users into sign-up or product surfaces when appropriate

### Architectural notes
- these routes should remain publicly accessible
- they should not accidentally inherit authenticated dashboard assumptions
- route gating bugs at this layer create user-facing trust issues quickly

---

## 2. Authenticated Application Surface

### What it includes
- dashboard
- conversations
- workspaces
- onboarding
- settings
- other user-specific application flows

### Responsibilities
- hold user-specific product state
- drive actual AI interaction workflows
- expose workspace-aware and profile-aware behavior
- provide product functionality rather than just marketing/informational content

### Architectural notes
- this layer depends on authenticated identity
- it increasingly depends on workspace and operating-profile context
- it should not be treated as the same system as the landing surface with auth added on top

---

## 3. API and Server Behavior Layer

### What it includes
- route handlers under `app/api/...`
- server-side runtime selection logic
- conversation orchestration logic
- integration callbacks and cron endpoints

### Responsibilities
- process chat and application actions
- resolve server-side behavior
- provide structured interfaces between UI and backend logic
- enforce protected/public API boundaries
- support scheduled and external workflows

### Important architectural direction
A key direction in the system is moving more behavioral truth into the server layer, especially around:
- runtime mode selection
- workspace-aware behavior
- operating-profile-aware decision making

This reduces misleading client-side state and makes behavior more inspectable.

---

## 4. Data / Persistence Layer

### What it includes
- Supabase / PostgreSQL-backed structured data
- relational application state
- emerging memory/retrieval-related state and supporting persistence

### Responsibilities
- persist user/application data
- support workspace and profile models
- back conversations and other product structures
- support scheduled/integration workflows that need durable state

### Architectural note
The persistence layer is not just a passive storage bucket. It increasingly supports architectural transitions in the product, especially around:
- workspace-first behavior
- profile-derived runtime decisions
- memory/context system evolution

---

## 5. Automation / Integration Layer

### What it includes
- cron-triggered routes
- webhook endpoints
- integration callbacks
- social/distribution automation
- external messaging/integration flows

### Responsibilities
- coordinate scheduled tasks
- handle external platform events
- maintain non-UI workflows
- bridge product logic with outside systems

### Architectural note
This layer should be understood as part of the production system, not as “extra scripts.” It can materially affect:
- product behavior
- public outputs
- operational risk
- debugging complexity

---

## Cross-Cutting Architecture Themes

## A. Workspace-First Model

A major product shift in the codebase is toward making **workspace** the primary runtime container rather than treating chat as a generic standalone surface.

### Why it matters
Workspaces are intended to shape:
- context scope
- memory behavior
- runtime selection
- user organization
- future personalization and system composition

---

## B. Operating-Profile-Driven Runtime Behavior

The system direction includes moving behavior selection into a model where **operating profiles** influence runtime characteristics.

### Why it matters
This allows the system to support:
- different behavior/cost tradeoffs
- more honest runtime control
- future profile-aware AI behavior

This is one of the more important architectural differentiators in the codebase.

---

## C. Prepared Context over Naive Raw History

The system is moving toward a prepared-context model instead of relying only on unstructured rolling message history.

### Why it matters
Prepared context enables:
- clearer prompt structure
- better memory boundaries
- more explicit retrieval/context composition
- safer future graph/retrieval augmentation

---

## D. Public / Protected Boundary Discipline

Because the product mixes public pages, authenticated pages, APIs, and callbacks, boundary discipline matters a lot.

### Common failure mode
A public UI route can link into a protected surface unintentionally, producing a sign-in wall or unexpected auth bounce.

This is why route visibility must be documented and reviewed carefully.

---

## Request Flow (High-Level)

## Public Page Flow
1. user requests public page
2. middleware/proxy determines route is public
3. locale handling is applied
4. public content is rendered without auth requirement

## Authenticated Product Flow
1. user requests authenticated route
2. middleware/proxy checks auth
3. user identity is resolved
4. localized app shell loads
5. page-specific data and runtime behavior load based on user/application context

## Chat / Runtime Flow (Simplified)
1. frontend submits request to API layer
2. server resolves conversation/workspace/profile context
3. prepared context is assembled
4. runtime mode/model behavior is selected server-side
5. model/provider path executes
6. response is returned with optional debug visibility depending on implementation

## Automation / Cron Flow
1. scheduled or external trigger hits API route
2. route executes server-side task logic
3. state is read/written through persistence layer
4. integration/public side effects may be produced depending on the job

---

## Trust Boundaries

The architecture has several important trust boundaries:

### Public Visitors
- can access public informational surfaces
- should not be able to mutate protected product state

### Authenticated Users
- can access product surfaces appropriate to their identity and configuration

### Backend/Internal Jobs
- can execute privileged logic not available to public clients

### External Platforms
- can call designated callback/webhook endpoints only through explicit allowed surfaces

Trust boundary confusion is one of the easiest ways for this kind of system to become fragile.

---

## Operational Realities

The codebase has already surfaced a few important operational realities:
- cloud build truth can be more reliable than local build truth
- deployment action logs may be noisy or lossy
- route gating issues can produce production bugs quickly
- architecture changes need documentation alongside implementation to stay legible

These realities should be treated as part of the architecture, not separate from it.

---

## What This Architecture Is Becoming

Genie AI is increasingly becoming:

> a workspace-centric, operating-profile-aware, memory-native AI platform with public discovery surfaces, authenticated execution surfaces, and backend automation/integration layers.

That description is more accurate than a simpler “chatbot app” label.

---

## Recommended Next Architecture Docs

This backbone doc should be followed by more specific architecture documents for:
- runtime mode routing
- memory and context architecture
- public route boundaries
- truth surfaces and deployment verification
- API reference behavior
