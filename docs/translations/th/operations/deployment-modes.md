# Deployment Modes (โหมดการปรับใช้/Deployment Modes)

## Purpose (วัตถุประสงค์)

This document defines the official deployment modes Lattice OS should support for business adoption (เอกสารนี้กำหนด official deployment modes ที่ Lattice OS ควร support สำหรับ business adoption)

It exists to make self-hosted planning, packaging, operations, and support more concrete than a vague "deploy anywhere" story (มันมีอยู่เพื่อทำให้ self-hosted planning, packaging, operations, และ support concrete มากกว่า vague "deploy anywhere" story)

---

## Executive Summary (สรุปผู้บริหาร)

Lattice should present a **small set of official deployment modes** aligned to real buyer needs (Lattice ควร present a **small set of official deployment modes** aligned to real buyer needs)

Recommended official modes (โหมดที่แนะนำอย่างเป็นทางการ):

1. **Mode A — Standard Internal Deployment** (Standard Internal Deployment)
2. **Mode B — Customer-Facing Assistant Deployment** (Customer-Facing Assistant Deployment)
3. **Mode C — Advanced Private / Memory-Rich Deployment** (Advanced Private / Memory-Rich Deployment)
4. **Mode D — Infrastructure / Platform Deployment** (Infrastructure / Platform Deployment)

The first real self-hosted business story should be (The first real self-hosted business story should be):

## **Mode A — Standard Internal Deployment**

That is the cleanest, most credible first deployment profile for Lattice OS (นั่นคือ profile การปรับใช้ครั้งแรกที่ clean ที่สุดและ credible ที่สุดสำหรับ Lattice OS)

---

## Why Deployment Modes Matter (ทำไม Deployment Modes จึง Matter)

Without explicit deployment modes, businesses face ambiguity around (Without explicit deployment modes, businesses face ambiguity around):
- required services (required services)
- optional services (optional services)
- worker expectations (worker expectations)
- storage/retrieval boundaries (storage/retrieval boundaries)
- local/private vs provider-assisted behavior (local/private vs provider-assisted behavior)
- what is actually supported vs theoretically possible (what is actually supported vs theoretically possible)

Deployment modes turn self-hosting from a theory into an operational contract (Deployment modes turn self-hosting from a theory into an operational contract)

---

## Mode A — Standard Internal Deployment (Mode A — Standard Internal Deployment)

### Who it is for (สำหรับใคร)
- internal document-heavy knowledge teams (internal document-heavy knowledge teams)
- consulting/agencies (consulting/agencies)
- product/ops/research teams (product/ops/research teams)
- early business self-hosted adopters (early business self-hosted adopters)

### Primary use case (Primary use case / กรณีใช้งานหลัก)
Workspace-scoped internal reasoning over uploaded documents, ongoing project context, and persistent memory (Workspace-scoped internal reasoning over uploaded documents, ongoing project context, and persistent memory)

### Goal (Goal / เป้าหมาย)
Make Lattice easy to install and useful for internal teams without requiring advanced infrastructure (Make Lattice easy to install and useful for internal teams without requiring advanced infrastructure)

### Required components (Required components / องค์ประกอบที่จำเป็น)
- web/app service (web/app service)
- database (database)
- object storage (object storage)
- authentication provider/config (authentication provider/config)
- any essential background worker only if the current feature set truly requires it (any essential background worker only if the current feature set truly requires it)

### Optional components (Optional components / องค์ประกอบทางเลือก)
- advanced archival/compression worker (advanced archival/compression worker)
- local/private retrieval sidecar (local/private retrieval sidecar)
- observability provider (observability provider)
- social/agent integrations (social/agent integrations)
- GPU worker (GPU worker)

### Feature expectations (Feature expectations / ความคาดหวังของ Features)
Should support (Should support / ควร support):
- user auth (user auth)
- workspaces (workspaces)
- document upload (document upload)
- preview (preview)
- warm retrieval/querying (warm retrieval/querying)
- document-backed chat/reasoning (document-backed chat/reasoning)

Should not require (Should not require / ไม่ควร require):
- cold archival worker (cold archival worker)
- advanced multimodal ingestion (advanced multimodal ingestion)
- customer-facing tenancy/admin complexity (customer-facing tenancy/admin complexity)

---

## Mode B — Customer-Facing Assistant Deployment (Mode B — Customer-Facing Assistant Deployment)

### Who it is for (สำหรับใคร)
- SaaS companies (SaaS companies)
- onboarding/support assistant builders (onboarding/support assistant builders)
- companies embedding Lattice into a user-facing product layer (companies embedding Lattice into a user-facing product layer)

### Primary use case (Primary use case / กรณีใช้งานหลัก)
Power a customer-facing assistant or copilot using scoped knowledge, memory, and retrieval (Power a customer-facing assistant or copilot using scoped knowledge, memory, and retrieval)

### Goal (Goal / เป้าหมาย)
Let product teams run Lattice inside their own stack for customer-facing workflows with clear tenant and trust boundaries (Let product teams run Lattice inside their own stack for customer-facing workflows with clear tenant and trust boundaries)

### Additional operational expectations (Additional operational expectations / ความคาดหวังทางปฏิบัติการเพิ่มเติม)
- stronger observability/tracing (stronger observability/tracing)
- clearer tenant/customer isolation (clearer tenant/customer isolation)
- stronger public-facing trust UX (stronger public-facing trust UX)
- admin/operator visibility (admin/operator visibility)

### Why it comes second (Why it comes second / ทำไมมันมาก่อน)
This segment has a higher reliability and trust bar than Mode A (This segment has a higher reliability and trust bar than Mode A)

---

## Mode C — Advanced Private / Memory-Rich Deployment (Mode C — Advanced Private / Memory-Rich Deployment)

### Who it is for (สำหรับใคร)
- privacy-sensitive businesses (privacy-sensitive businesses)
- teams with heavier retrieval/memory needs (teams with heavier retrieval/memory needs)
- buyers interested in local/private indexing and deeper lifecycle control (buyers interested in local/private indexing and deeper lifecycle control)

### Primary use case (Primary use case / กรณีใช้งานหลัก)
Run Lattice with stronger privacy, richer document/memory behavior, and optional advanced archival or local retrieval layers (Run Lattice with stronger privacy, richer document/memory behavior, and optional advanced archival or local retrieval layers)

### Goal (Goal / เป้าหมาย)
Offer a more powerful deployment profile without forcing every business into full complexity by default (Offer a more powerful deployment profile without forcing every business into full complexity by default)

### Likely additional components (Likely additional components / องค์ประกอบเพิ่มเติมที่เป็นไปได้)
- queue/broker if archival/async flows enabled (queue/broker if archival/async flows enabled)
- advanced worker topology (advanced worker topology)
- optional local retrieval backend/sidecar (optional local retrieval backend/sidecar)
- optional richer ingestion services (optional richer ingestion services)

### Why it is an advanced mode (Why it is an advanced mode / ทำไมมันเป็น advanced mode)
This should be an explicit opt-in expansion, not the default baseline (This should be an explicit opt-in expansion, not the default baseline)

---

## Mode D — Infrastructure / Platform Deployment (Mode D — Infrastructure / Platform Deployment)

### Who it is for (สำหรับใคร)
- AI-native startups (AI-native startups)
- internal AI platform teams (internal AI platform teams)
- infrastructure buyers (infrastructure buyers)
- product teams that want Lattice as substrate rather than just as an app (product teams that want Lattice as substrate rather than just as an app)

### Primary use case (Primary use case / กรณีใช้งานหลัก)
Use Lattice as an installable memory/retrieval/execution substrate inside a larger product/platform architecture (Use Lattice as an installable memory/retrieval/execution substrate inside a larger product/platform architecture)

### Goal (Goal / เป้าหมาย)
Make Lattice viable as a modular platform component for technical buyers (Make Lattice viable as a modular platform component for technical buyers)

### Operational expectations (Operational expectations / ความคาดหวังทางปฏิบัติการ)
This is the highest bar mode (This is the highest bar mode)
It requires (It requires):
- clear topology (clear topology)
- preflight checks (preflight checks)
- upgrade guidance (upgrade guidance)
- modular docs (modular docs)
- install confidence (install confidence)

### Why it is later (Why it is later / ทำไมมันจึงเป็นภายหลัง)
This is a maturity mode, not the baseline starting point (This is a maturity mode, not the baseline starting point)

---

## Recommended Official Support Order (Recommended Official Support Order / ลำดับ Official Support ที่แนะนำ)

### Phase 1 support (Phase 1 support / Phase 1 support)
- **Mode A — Standard Internal Deployment**

### Phase 2 support (Phase 2 support / Phase 2 support)
- **Mode B — Customer-Facing Assistant Deployment**

### Phase 3 support (Phase 3 support / Phase 3 support)
- **Mode C — Advanced Private / Memory-Rich Deployment**
- **Mode D — Infrastructure / Platform Deployment**

This keeps the support matrix aligned with product maturity and buyer expectations (This keeps the support matrix aligned with product maturity and buyer expectations)

---

## Final Recommendation (Final Recommendation / คำแนะนำสุดท้าย)

Support a small set of official deployment modes, in sequence (Support a small set of official deployment modes, in sequence)

The first real self-hosted business story should remain (The first real self-hosted business story should remain):

## **Mode A — Standard Internal Deployment**