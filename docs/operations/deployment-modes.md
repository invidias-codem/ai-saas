# Deployment Modes

## Purpose

This document defines the official deployment modes Lattice OS should support for business adoption.

It exists to make self-hosted planning, packaging, operations, and support more concrete than a vague “deploy anywhere” story.

---

## Executive Summary

Lattice should present a **small set of official deployment modes** aligned to real buyer needs.

Recommended official modes:

1. **Mode A — Standard Internal Deployment**
2. **Mode B — Customer-Facing Assistant Deployment**
3. **Mode C — Advanced Private / Memory-Rich Deployment**
4. **Mode D — Infrastructure / Platform Deployment**

The first real self-hosted business story should be:

## **Mode A — Standard Internal Deployment**

That is the cleanest, most credible first deployment profile for Lattice OS.

---

## Why Deployment Modes Matter

Without explicit deployment modes, businesses face ambiguity around:
- required services
- optional services
- worker expectations
- storage/retrieval boundaries
- local/private vs provider-assisted behavior
- what is actually supported vs theoretically possible

Deployment modes turn self-hosting from a theory into an operational contract.

---

## Mode A — Standard Internal Deployment

### Who it is for
- internal document-heavy knowledge teams
- consulting/agencies
- product/ops/research teams
- early business self-hosted adopters

### Primary use case
Workspace-scoped internal reasoning over uploaded documents, ongoing project context, and persistent memory.

### Goal
Make Lattice easy to install and useful for internal teams without requiring advanced infrastructure.

### Required components
- web/app service
- database
- object storage
- authentication provider/config
- any essential background worker only if the current feature set truly requires it

### Optional components
- advanced archival/compression worker
- local/private retrieval sidecar
- observability provider
- social/agent integrations
- GPU worker

### Feature expectations
Should support:
- user auth
- workspaces
- document upload
- preview
- warm retrieval/querying
- document-backed chat/reasoning

Should not require:
- cold archival worker
- advanced multimodal ingestion
- customer-facing tenancy/admin complexity

---

## Mode B — Customer-Facing Assistant Deployment

### Who it is for
- SaaS companies
- onboarding/support assistant builders
- companies embedding Lattice into a user-facing product layer

### Primary use case
Power a customer-facing assistant or copilot using scoped knowledge, memory, and retrieval.

### Goal
Let product teams run Lattice inside their own stack for customer-facing workflows with clear tenant and trust boundaries.

### Additional operational expectations
- stronger observability/tracing
- clearer tenant/customer isolation
- stronger public-facing trust UX
- admin/operator visibility

### Why it comes second
This segment has a higher reliability and trust bar than Mode A.

---

## Mode C — Advanced Private / Memory-Rich Deployment

### Who it is for
- privacy-sensitive businesses
- teams with heavier retrieval/memory needs
- buyers interested in local/private indexing and deeper lifecycle control

### Primary use case
Run Lattice with stronger privacy, richer document/memory behavior, and optional advanced archival or local retrieval layers.

### Goal
Offer a more powerful deployment profile without forcing every business into full complexity by default.

### Likely additional components
- queue/broker if archival/async flows enabled
- advanced worker topology
- optional local retrieval backend/sidecar
- optional richer ingestion services

### Why it is an advanced mode
This should be an explicit opt-in expansion, not the default baseline.

---

## Mode D — Infrastructure / Platform Deployment

### Who it is for
- AI-native startups
- internal AI platform teams
- infrastructure buyers
- product teams that want Lattice as substrate rather than just as an app

### Primary use case
Use Lattice as an installable memory/retrieval/execution substrate inside a larger product/platform architecture.

### Goal
Make Lattice viable as a modular platform component for technical buyers.

### Operational expectations
This is the highest bar mode.
It requires:
- clear topology
- preflight checks
- upgrade guidance
- modular docs
- install confidence

### Why it is later
This is a maturity mode, not the baseline starting point.

---

## Recommended Official Support Order

### Phase 1 support
- **Mode A — Standard Internal Deployment**

### Phase 2 support
- **Mode B — Customer-Facing Assistant Deployment**

### Phase 3 support
- **Mode C — Advanced Private / Memory-Rich Deployment**
- **Mode D — Infrastructure / Platform Deployment**

This keeps the support matrix aligned with product maturity and buyer expectations.

---

## Final Recommendation

Support a small set of official deployment modes, in sequence.

The first real self-hosted business story should remain:

## **Mode A — Standard Internal Deployment**
