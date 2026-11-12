# Topology Dịch Vụ Self-Hosted (Self-Hosted Service Topology)

## Mục Đích (Purpose)

Tài liệu này defines (định nghĩa) recommended service topology (topology dịch vụ được khuyến nghị) cho business self-hosted Lattice deployments (triển khai Lattice self-hosted cho doanh nghiệp), starting with a practical Docker Compose baseline (bắt đầu với một practical Docker Compose baseline).

Nó là the service-topology counterpart to the deployment modes and environment/config contract (là service-topology counterpart to the deployment modes and environment/config contract).

---

## Executive Summary (Tóm Tắt Điều Hành)

The first real self-hosted deployment story for Lattice should be based on (Câu chuyện self-hosted deployment thực sự đầu tiên cho Lattice nên based on):

## **a small, opinionated Docker Compose baseline aligned to Mode A — Standard Internal Deployment** (một small, opinionated Docker Compose baseline aligned to Mode A — Standard Internal Deployment)

That baseline should support (Baseline đó nên support):
- web/app runtime (web/app runtime)
- database (database)
- object storage integration (object storage integration)
- document upload / preview / query path (document upload / preview / query path)
- any essential background worker only if the current feature set truly requires it (any essential background worker chỉ khi current feature set truly requires it)

More advanced components should be opt-in expansions, not baseline requirements (More advanced components should be opt-in expansions, not baseline requirements).

---

## Baseline Mode A Topology (Baseline Mode A Topology / Topology Baseline Mode A)

### Required services (Các Dịch Vụ Bắt Buộc)

#### `app`
Primary Lattice web/API runtime (Primary Lattice web/API runtime).

Responsibilities (Trách Nhiệm):
- public and authenticated web UI (public and authenticated web UI)
- API routes (API routes)
- chat/query routes (chat/query routes)
- document ingestion routes (document ingestion routes)
- preview routes (preview routes)
- auth/session handling (auth/session handling)

#### `db`
Primary relational data service (Primary relational data service).

Responsibilities:
- user/workspace state (user/workspace state)
- document records (document records)
- chunk/embedding metadata (chunk/embedding metadata)
- memory/state tables (memory/state tables)
- audit and operational records (audit and operational records)

#### `storage`
Object storage for uploaded files (Object storage for uploaded files).

Responsibilities:
- raw uploaded document storage (raw uploaded document storage)
- file retrieval for extraction/preview/hydration paths (file retrieval for extraction/preview/hydration paths)

Storage may be (Storage may be):
- an external cloud bucket (an external cloud bucket)
- a private object store (a private object store)
- or later an S3-compatible local service (or later an S3-compatible local service)

### Optional baseline service (Dịch Vụ Baseline Tùy Chọn)

#### `worker`
Background worker runtime (Background worker runtime).

Include only if current core flows truly require it (Include only if current core flows truly require it).

Possible responsibilities (Possible responsibilities / Trách Nhiệm Có Thể):
- background indexing jobs (background indexing jobs)
- document post-processing (document post-processing)
- queue consumption (queue consumption)
- maintenance tasks (maintenance tasks)

---

## Recommended Baseline Shapes (Các Hình Dáng Baseline Được Khuyến Nghị)

### Option A — Lean baseline (Option A — Lean baseline)
- `app`
- `db`
- storage integration (storage integration)

Use when (Sử Dụng Khi):
- upload/query path can run synchronously enough for baseline installs (upload/query path can run synchronously enough for baseline installs)
- worker separation is not essential for real value (worker separation is not essential for real value)

### Option B — Pragmatic baseline (Option B — Pragmatic baseline)
- `app`
- `db`
- `worker`
- storage integration (storage integration)

Use when:
- ingestion/indexing/background tasks materially benefit from worker isolation (ingestion/indexing/background tasks materially benefit from worker isolation)

### Recommendation (Khuyến Nghị)
Prefer the leanest truthful baseline (Prefer the leanest truthful baseline).
Only require `worker` if the real Mode A functionality depends on it already (Only require `worker` if the real Mode A functionality depends on it already).

---

## Mode B Extensions — Customer-Facing Assistant Deployment (Mode B Extensions — Customer-Facing Assistant Deployment)

Mode B likely keeps the same core service topology, but operational expectations rise (Mode B likely keeps the same core service topology, but operational expectations rise).

Additional likely needs (Additional likely needs / Nhu Cầu Bổ Sung Có Khả Năng):
- stronger observability integration (stronger observability integration)
- cleaner worker separation if customer-facing async flows increase (cleaner worker separation if customer-facing async flows increase)
- more explicit admin/operator support surfaces (more explicit admin/operator support surfaces)

---

## Mode C Extensions — Advanced Private / Memory-Rich Deployment (Mode C Extensions — Advanced Private / Memory-Rich Deployment)

Potential added services (Potential added services / Các Dịch Vụ Thêm Có Khả Năng):
- `queue` (`queue`)
- `retrieval` (`retrieval`)
- `archive-worker` (`archive-worker`)

These are explicit opt-in extensions and should not be baseline assumptions (These are explicit opt-in extensions and should not be baseline assumptions).

---

## Mode D Extensions — Infrastructure / Platform Deployment (Mode D Extensions — Infrastructure / Platform Deployment)

Possible service decomposition (Possible service decomposition / Phân Rã Dịch Vụ Có Khả Năng):
- `app` (`app`)
- `api` (`api`)
- `worker` (`worker`)
- `queue` (`queue`)
- `retrieval` (`retrieval`)
- `archive-worker` (`archive-worker`)
- `observability adapters` (`observability adapters`)
- future runtime/harness service if exposed separately (future runtime/harness service if exposed separately)

This is a later maturity topology, not the first supported self-hosted path (This is a later maturity topology, not the first supported self-hosted path).

---

## Baseline Operational Story (Baseline Operational Story / Câu Chuyện Vận Hành Baseline)

For Mode A business installs, the service topology should support a simple story (For Mode A business installs, the service topology should support a simple story):

1. start services (start services)
2. run migrations (run migrations)
3. confirm health (confirm health)
4. log in (log in)
5. upload a document (upload a document)
6. preview it (preview it)
7. query it in a workspace (query it in a workspace)

If the topology cannot support that cleanly, the baseline is too complex (If the topology cannot support that cleanly, the baseline is too complex).

---

## Final Recommendation (Khuyến Nghị Cuối Cùng)

The first official self-hosted topology for Lattice should be (Topology self-hosted chính thức đầu tiên cho Lattice nên là):

## **Mode A / Docker Compose baseline centered on `app + db`, with storage as a required integration and worker only added if the real product flow requires it.** (Mode A / Docker Compose baseline centered on `app + db`, with storage as a required integration and worker only added if the real product flow requires it.)