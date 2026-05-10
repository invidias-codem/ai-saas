# Technology Transparency

## Purpose

This document describes the core technologies, infrastructure surfaces, and major runtime layers used by Genie AI.

It exists to make the platform easier to understand for:
- developers
- contributors
- technical reviewers
- collaborators
- operators

This is not a marketing page. It is a practical technology disclosure and orientation document.

---

## Product Shape

Genie AI is a web-based AI workspace platform that combines:
- conversational AI
- workspace-aware routing
- operating-profile-based runtime behavior
- memory/context preparation
- integrations and scheduled jobs
- a growing multi-surface architecture spanning public landing pages, authenticated product routes, APIs, and external integrations

The system is evolving from a more generic chatbot/tool surface into a more workspace-centric and memory-native platform.

---

## Primary Application Stack

### Frontend Framework
- **Next.js**
- **React**
- App Router-based route structure

### Styling / UI
- **Tailwind CSS**
- component-level UI primitives under `components/`
- separate treatment for public marketing surfaces vs authenticated product surfaces

### Language
- **TypeScript** across the primary web application surface

### Internationalization
- **next-intl**
- locale-prefixed routes
- route handling shaped around a localized application shell

---

## Authentication and Identity

### Auth Provider
- **Clerk**

### Auth Model
- public and protected routes are separated through middleware/proxy-based route checks
- authenticated product routes require user identity
- public landing/support/privacy/blog/docs routes are intended to remain accessible without sign-in

### Important Behavior
- route gating is not only a UI concern; it is enforced in middleware/proxy logic
- incorrect public-route allowlisting can cause otherwise public pages to be blocked behind sign-in

---

## Data and Persistence

### Database / Structured Persistence
- **Supabase / PostgreSQL**

### Current Usage Patterns
Supabase is used for relational persistence across product features, including emerging workspace/profile flows and other structured application data.

### Vector / Retrieval Direction
- the codebase includes direction toward memory, retrieval, and embedding-aware architecture
- exact active production retrieval topology may continue evolving as architecture transitions continue

### Important Caveat
The local repository may contain schema/migration drift during active development, so the live database state and committed migration state should be treated carefully and verified explicitly.

---

## AI / LLM Layer

### Model Provider Strategy
Genie AI supports a provider-based architecture rather than a single hardcoded model path.

### Current Role of the AI Layer
The AI subsystem is used for:
- conversation generation
- runtime-mode-dependent behavior
- context-prepared prompting
- integration-facing automation features
- agent-like workflows in some subsystems

### Architectural Direction
A key direction in the codebase is to move toward:
- prepared context
- stronger memory boundaries
- workspace-aware behavior
- server-side runtime selection
- more explicit system composition rather than one generic chat flow

---

## Memory / Context Direction

The codebase includes a prepared-context direction rather than relying only on raw rolling chat history.

### Intended Role
Memory/context systems are being shaped to support:
- better prompt construction
- safer context layering
- workspace-aware personalization
- future graph/retrieval augmentation

### Important Note
This area is architecturally important and still evolving. It should be treated as a major subsystem, not a minor prompt helper.

---

## Runtime Mode Selection

A notable architectural decision in the system is that runtime behavior is increasingly resolved on the **server side**, rather than trusting client-side mode toggles alone.

### Why
This reduces misleading UI states and makes runtime behavior more consistent with:
- conversation context
- workspace context
- operating profile context

### Debugability
The system has used debug headers such as:
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

to help validate runtime behavior.

---

## Background Jobs / Automation

The platform includes scheduled and automation-oriented behaviors.

### Examples
- cron-driven routes
- social/distribution agent flows
- ingestion/update jobs
- integration callbacks/webhooks

### Operational Note
These jobs should be treated as first-class production surfaces and not as invisible side features. They need observability, route clarity, and failure-mode documentation.

---

## Messaging / External Integrations

The codebase contains or has contained integrations such as:
- **Slack**
- **Telegram**
- webhook-driven external surfaces
- social distribution / agent-related systems

These integrations often span:
- public callback routes
- authenticated management/configuration surfaces
- backend automation or cron paths

---

## Hosting / Deployment Surfaces

### Web Application Hosting
- **Vercel**

### Additional Deployment Surface
- **Firebase Hosting** has also been part of deployment/workflow handling in the repo context

### Important Operational Reality
Deploy truth, runtime truth, and action-log truth are not always identical.

For example:
- a GitHub workflow may fail while the runtime artifact still exists
- a deploy action may be noisy while the live app is healthy
- local builds may be unreliable compared with cloud validation

This is why operational documentation should distinguish between:
- CI truth
- deploy truth
- runtime truth

---

## Public vs Authenticated Surface Split

The product currently contains at least two broad UI classes:

### Public / Unauthenticated Surfaces
- landing pages
- support
- privacy
- docs
- public blog and similar marketing/informational routes

### Authenticated / Product Surfaces
- dashboard
- workspace routes
- conversation routes
- onboarding/product flows
- settings and internal user state surfaces

This split matters for:
- auth rules
- design consistency
- route gating
- error diagnosis
- public documentation quality

---

## Notable Product/Architecture Themes

The codebase increasingly reflects these themes:
- workspace-first interaction model
- operating-profile-driven runtime behavior
- memory-native / context-prepared AI architecture
- server-resolved runtime selection
- hybrid product shape spanning public marketing + authenticated execution surfaces

These themes are more representative of the current direction than an older “single chatbot with tool pages” mental model.

---

## Current Documentation Gaps

The technology surfaces above exist, but some still need better documentation, especially around:
- public route boundaries
- runtime mode routing
- memory/context architecture
- API reference coverage
- trust boundaries
- deployment truth surfaces

This document is intended to serve as a transparent entry point, not the final word on all subsystem behavior.
