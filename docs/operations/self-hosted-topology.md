# Self-Hosted Service Topology

## Purpose

This document defines the recommended service topology for business self-hosted Lattice deployments, starting with a practical Docker Compose baseline.

It is the service-topology counterpart to the deployment modes and environment/config contract.

---

## Executive Summary

The first real self-hosted deployment story for Lattice should be based on:

## **a small, opinionated Docker Compose baseline aligned to Mode A — Standard Internal Deployment**

That baseline should support:
- web/app runtime
- database
- object storage integration
- document upload / preview / query path
- any essential background worker only if the current feature set truly requires it

More advanced components should be opt-in expansions, not baseline requirements.

---

## Baseline Mode A Topology

### Required services

#### `app`
Primary Lattice web/API runtime.

Responsibilities:
- public and authenticated web UI
- API routes
- chat/query routes
- document ingestion routes
- preview routes
- auth/session handling

#### `db`
Primary relational data service.

Responsibilities:
- user/workspace state
- document records
- chunk/embedding metadata
- memory/state tables
- audit and operational records

#### `storage`
Object storage for uploaded files.

Responsibilities:
- raw uploaded document storage
- file retrieval for extraction/preview/hydration paths

Storage may be:
- an external cloud bucket
- a private object store
- or later an S3-compatible local service

### Optional baseline service

#### `worker`
Background worker runtime.

Include only if current core flows truly require it.

Possible responsibilities:
- background indexing jobs
- document post-processing
- queue consumption
- maintenance tasks

---

## Recommended Baseline Shapes

### Option A — Lean baseline
- `app`
- `db`
- storage integration

Use when:
- upload/query path can run synchronously enough for baseline installs
- worker separation is not essential for real value

### Option B — Pragmatic baseline
- `app`
- `db`
- `worker`
- storage integration

Use when:
- ingestion/indexing/background tasks materially benefit from worker isolation

### Recommendation
Prefer the leanest truthful baseline.
Only require `worker` if the real Mode A functionality depends on it already.

---

## Mode B Extensions — Customer-Facing Assistant Deployment

Mode B likely keeps the same core service topology, but operational expectations rise.

Additional likely needs:
- stronger observability integration
- cleaner worker separation if customer-facing async flows increase
- more explicit admin/operator support surfaces

---

## Mode C Extensions — Advanced Private / Memory-Rich Deployment

Potential added services:
- `queue`
- `retrieval`
- `archive-worker`

These are explicit opt-in extensions and should not be baseline assumptions.

---

## Mode D Extensions — Infrastructure / Platform Deployment

Possible service decomposition:
- `app`
- `api`
- `worker`
- `queue`
- `retrieval`
- `archive-worker`
- `observability adapters`
- future runtime/harness service if exposed separately

This is a later maturity topology, not the first supported self-hosted path.

---

## Baseline Operational Story

For Mode A business installs, the service topology should support a simple story:

1. start services
2. run migrations
3. confirm health
4. log in
5. upload a document
6. preview it
7. query it in a workspace

If the topology cannot support that cleanly, the baseline is too complex.

---

## Final Recommendation

The first official self-hosted topology for Lattice should be:

## **Mode A / Docker Compose baseline centered on `app + db`, with storage as a required integration and worker only added if the real product flow requires it.**
