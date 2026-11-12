# Các Chế Độ Triển Khai (Deployment Modes)

## Mục Đích (Purpose)

Tài liệu này định nghĩa (defines) các official deployment modes (chế độ triển khai chính thức) mà Lattice OS nên support (hỗ trợ) cho business adoption (sử dụng trong doanh nghiệp).

Nó tồn tại để make self-hosted planning, packaging, operations, and support more concrete than a vague "deploy anywhere" story (nó tồn tại để làm cho self-hosted planning, packaging, operations, và support cụ thể hơn thay vì một câu chuyện "deploy anywhere" mơ hồ).

---

## Executive Summary (Tóm Tắt Điều Hành)

Lattice should present a **small set of official deployment modes** aligned to real buyer needs (Lattice nên trình bày một **small set of official deployment modes** phù hợp với real buyer needs).

Recommended official modes (Các official modes được khuyến nghị):
1. **Mode A — Standard Internal Deployment** (Triển Khai Nội Bộ Tiêu Chuẩn)
2. **Mode B — Customer-Facing Assistant Deployment** (Triển Khai Trợ Lý Đối Mặt Khách Hàng)
3. **Mode C — Advanced Private / Memory-Rich Deployment** (Triển Khai Nâng Cao Riêng Tư / Giàu Bộ Nhớ)
4. **Mode D — Infrastructure / Platform Deployment** (Triển Khai Cơ Sở Hạ Tầng / Nền Tảng)

The first real self-hosted business story should be (Câu chuyện self-hosted business thực sự đầu tiên nên là):

## **Mode A — Standard Internal Deployment**

That is the cleanest, most credible first deployment profile for Lattice OS (Đó là profile triển khai đầu tiên clean nhất, credible nhất cho Lattice OS).

---

## Why Deployment Modes Matter (Tại Sao Deployment Modes Quan Trọng)

Without explicit deployment modes, businesses face ambiguity around (Nếu không có explicit deployment modes, businesses sẽ face ambiguity xung quanh):
- required services (các dịch vụ bắt buộc)
- optional services (các dịch vụ tùy chọn)
- worker expectations (ky vọng của worker)
- storage/retrieval boundaries (ranh giới storage/retrieval)
- local/private vs provider-assisted behavior (hành vi local/private vs provider-assisted)
- what is actually supported vs theoretically possible (cái gì actually supported vs theoretically possible)

Deployment modes turn self-hosting from a theory into an operational contract (Deployment modes biến self-hosting từ một theory thành một operational contract/hợp đồng vận hành).

---

## Mode A — Standard Internal Deployment (Mode A — Triển Khai Nội Bộ Tiêu Chuẩn)

### Who it is for (Dành Cho Ai)
- internal document-heavy knowledge teams (internal document-heavy knowledge teams / các team knowledge nội bộ nhiều tài liệu)
- consulting/agencies (consulting/agencies)
- product/ops/research teams (product/ops/research teams)
- early business self-hosted adopters (early business self-hosted adopters / những early adopters self-hosted doanh nghiệp)

### Primary use case (Use Case Chính)
Workspace-scoped internal reasoning over uploaded documents, ongoing project context, and persistent memory (Workspace-scoped internal reasoning over uploaded documents, ongoing project context, and persistent memory).

### Goal (Mục Tiêu)
Make Lattice easy to install and useful for internal teams without requiring advanced infrastructure (Làm cho Lattice dễ cài đặt và hữu ích cho internal teams mà không requiring advanced infrastructure).

### Required components (Các Thành Phần Bắt Buộc)
- web/app service (web/app service)
- database (database)
- object storage (object storage)
- authentication provider/config (authentication provider/config)
- any essential background worker only if the current feature set truly requires it (any essential background worker chỉ khi current feature set truly requires it)

### Optional components (Các Thành Phần Tùy Chọn)
- advanced archival/compression worker (advanced archival/compression worker)
- local/private retrieval sidecar (local/private retrieval sidecar)
- observability provider (observability provider)
- social/agent integrations (social/agent integrations)
- GPU worker (GPU worker)

### Feature expectations (Kỳ Vọng Về Features)
Should support (Nên support):
- user auth (user auth)
- workspaces (workspaces)
- document upload (document upload)
- preview (preview)
- warm retrieval/querying (warm retrieval/querying)
- document-backed chat/reasoning (document-backed chat/reasoning)

Should not require (Không nên require):
- cold archival worker (cold archival worker)
- advanced multimodal ingestion (advanced multimodal ingestion)
- customer-facing tenancy/admin complexity (customer-facing tenancy/admin complexity)

---

## Mode B — Customer-Facing Assistant Deployment (Mode B — Triển Khai Trợ Lý Đối Mặt Khách Hàng)

### Who it is for (Dành Cho Ai)
- SaaS companies (SaaS companies)
- onboarding/support assistant builders (onboarding/support assistant builders)
- companies embedding Lattice into a user-facing product layer (companies embedding Lattice into a user-facing product layer)

### Primary use case (Use Case Chính)
Power a customer-facing assistant or copilot using scoped knowledge, memory, and retrieval (Power a customer-facing assistant or copilot using scoped knowledge, memory, and retrieval).

### Goal (Mục Tiêu)
Let product teams run Lattice inside their own stack for customer-facing workflows with clear tenant and trust boundaries (Cho phép product teams run Lattice inside their own stack cho customer-facing workflows với clear tenant and trust boundaries).

### Additional operational expectations (Kỳ Vọng Vận Hành Bổ Sung)
- stronger observability/tracing (stronger observability/tracing)
- clearer tenant/customer isolation (clearer tenant/customer isolation)
- stronger public-facing trust UX (stronger public-facing trust UX)
- admin/operator visibility (admin/operator visibility)

### Why it comes second (Tại Sao Nó Đến Thứ Hai)
This segment has a higher reliability and trust bar than Mode A (Segment này có higher reliability and trust bar hơn Mode A).

---

## Mode C — Advanced Private / Memory-Rich Deployment (Mode C — Triển Khai Nâng Cao Riêng Tư / Giàu Bộ Nhớ)

### Who it is for (Dành Cho Ai)
- privacy-sensitive businesses (privacy-sensitive businesses / doanh nghiệp nhạy cảm về privacy)
- teams with heavier retrieval/memory needs (teams with heavier retrieval/memory needs / các team có retrieval/memory needs nặng hơn)
- buyers interested in local/private indexing and deeper lifecycle control (buyers interested in local/private indexing and deeper lifecycle control / những buyer quan tâm local/private indexing và deeper lifecycle control)

### Primary use case (Use Case Chính)
Run Lattice with stronger privacy, richer document/memory behavior, and optional advanced archival or local retrieval layers (Run Lattice with stronger privacy, richer document/memory behavior, and optional advanced archival or local retrieval layers).

### Goal (Mục Tiêu)
Offer a more powerful deployment profile without forcing every business into full complexity by default (Cung cấp một deployment profile mạnh hơn mà không forcing every business into full complexity by default).

### Likely additional components (Các Thành Phần Bổ Sung Có Khả Năng)
- queue/broker if archival/async flows enabled (queue/broker if archival/async flows enabled)
- advanced worker topology (advanced worker topology)
- optional local retrieval backend/sidecar (optional local retrieval backend/sidecar)
- optional richer ingestion services (optional richer ingestion services)

### Why it is an advanced mode (Tại Sao Nó Là Advanced Mode)
This should be an explicit opt-in expansion, not the default baseline (Này nên là một explicit opt-in expansion, không phải default baseline).

---

## Mode D — Infrastructure / Platform Deployment (Mode D — Triển Khai Cơ Sở Hạ Tầng / Nền Tảng)

### Who it is for (Dành Cho Ai)
- AI-native startups (AI-native startups)
- internal AI platform teams (internal AI platform teams)
- infrastructure buyers (infrastructure buyers)
- product teams that want Lattice as substrate rather than just as an app (product teams that want Lattice as substrate rather than just as an app)

### Primary use case (Use Case Chính)
Use Lattice as an installable memory/retrieval/execution substrate inside a larger product/platform architecture (Sử dụng Lattice như một memory/retrieval/execution substrate có thể install được bên trong một larger product/platform architecture).

### Goal (Mục Tiêu)
Make Lattice viable as a modular platform component for technical buyers (Làm cho Lattice viable như một modular platform component cho technical buyers).

### Operational expectations (Kỳ Vọng Vận Hành)
This is the highest bar mode (Đây là highest bar mode).
It requires (Nó yêu cầu):
- clear topology (clear topology)
- preflight checks (preflight checks)
- upgrade guidance (upgrade guidance)
- modular docs (modular docs)
- install confidence (install confidence)

### Why it is later (Tại Sao Nó Muộn Hơn)
This is a maturity mode, not the baseline starting point (Đây là maturity mode, không phải baseline starting point).

---

## Recommended Official Support Order (Thứ Tự Official Support Được Khuyến Nghị)

### Phase 1 support (Phase 1 support / Hỗ Trợ Giai Đoạn 1)
- **Mode A — Standard Internal Deployment**

### Phase 2 support (Phase 2 support / Hỗ Trợ Giai Đoạn 2)
- **Mode B — Customer-Facing Assistant Deployment**

### Phase 3 support (Phase 3 support / Hỗ Trợ Giai Đoạn 3)
- **Mode C — Advanced Private / Memory-Rich Deployment**
- **Mode D — Infrastructure / Platform Deployment**

This keeps the support matrix aligned with product maturity and buyer expectations (Điều này keeps the support matrix aligned with product maturity and buyer expectations).

---

## Final Recommendation (Khuyến Nghị Cuối Cùng)

Support a small set of official deployment modes, in sequence (Hỗ trợ một small set of official deployment modes, in sequence).

The first real self-hosted business story should remain (Câu chuyện self-hosted business thực sự đầu tiên nên remain):

## **Mode A — Standard Internal Deployment**