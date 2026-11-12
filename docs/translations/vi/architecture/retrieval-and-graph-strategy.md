# Chiến Lược Retrieval Và Graph (Retrieval and Graph Strategy)

## Mục Đích

Tài liệu này giải thích retrieval and graph-oriented architectural direction (hướng kiến trúc hướng retrieval và graph) trong Genie AI.

Nó tồn tại vì platform's context and memory direction (hướng ngữ cảnh và bộ nhớ của nền tảng) is not well described by a simple "we use RAG" label (không được mô tả tốt bởi một simple "we use RAG" label).

The broader architectural goal is more specific (Mục tiêu kiến trúc rộng hơn là cụ thể hơn):
- prepared context rather than raw transcript stuffing (ngữ cảnh được chuẩn bị thay vì nhồi nhét transcript thô)
- retrieval as a structured support layer (retrieval như một structured support layer)
- future graph-aware composition rather than flat nearest-neighbor thinking alone (tổ hợp graph-aware trong tương lai thay vì flat nearest-neighbor thinking đơn độc)

Tài liệu này describes that direction at a high level (mô tả hướng đó ở mức độ cao).

---

## Nguyên Tắc Cốt Lõi (Core Principle)

Retrieval should support context assembly, not replace architecture (Retrieval nên hỗ trợ lắp ráp ngữ cảnh, không replace architecture).

In other words (Nói cách khác):
- retrieval is not the whole memory system (retrieval không phải là toàn bộ memory system)
- embeddings are not the whole intelligence layer (embeddings không phải là toàn bộ intelligence layer)
- graph structure is not valuable unless it improves relevance, boundaries, or explainability (cấu trúc graph không valuable trừ khi nó improves relevance, boundaries, hoặc explainability)

The point is to improve how context is selected and composed (Điểm là để improve cách context được selected và composed).

---

## Why "Just Use RAG" Is Not Enough (Tại Sao "Chỉ Dùng RAG" Không Đủ)

The phrase "RAG" is often too vague to be useful architecturally (Cụm từ "RAG" thường quá vague để useful về mặt kiến trúc).

It can mean very different things in practice (Nó có thể mean rất khác nhau trong practice):
- stuffing retrieved chunks into prompts (nhồi nhét retrieved chunks vào prompts)
- semantic search over documents (tìm kiếm semantic trên documents)
- tool-augmented retrieval flows (retrieval flows được augmented bởi tools)
- hybrid retrieval pipelines (hybrid retrieval pipelines)
- memory systems with weak structure (memory systems với weak structure)

For Genie AI, the more important question is (Đối với Genie AI, câu hỏi quan trọng hơn là):

**what role should retrieval play inside a workspace-centric, context-prepared architecture?** (retrieval nên đóng vai trò gì bên trong một workspace-centric, context-prepared architecture?)

---

## Retrieval as a Support Layer (Retrieval Là Một Support Layer)

The intended direction is that retrieval should help answer questions like (Hướng intended là retrieval nên help answer questions như):
- what supporting material is relevant right now? (supporting material nào relevant ngay bây giờ?)
- what workspace-linked information should influence this run? (workspace-linked information nào nên influence run này?)
- what context should be elevated without bloating the prompt? (context nào nên được elevated mà không bloating prompt?)

This makes retrieval a context-selection mechanism, not an end in itself (Điều này makes retrieval a context-selection mechanism, not an end in itself).

---

## Relationship to Prepared Context (Mối Quan Hệ Với Prepared Context)

Prepared context is the central architectural pattern (Prepared context là central architectural pattern).

Retrieval and graph-aware systems should plug into that pattern by contributing (Retrieval and graph-aware systems should plug into that pattern by contributing/đóng góp):
- relevant support material (vật liệu hỗ trợ relevant)
- structured relationship context (ngữ cảnh mối quan hệ có cấu trúc)
- bounded memory cues (cues bộ nhớ bị giới hạn)

They should not simply dump large amounts of semantically related text into the model and call that architecture (Chúng không nên simply dump large amounts of semantically related text vào model và call that architecture).

---

## Workspace-Scoped Retrieval (Retrieval Được Scoped Theo Workspace)

A workspace-first product needs retrieval that respects scope (Một workspace-first product cần retrieval that respects scope).

### Why this matters (Tại sao điều này quan trọng)
Without workspace boundaries (Nếu không có workspace boundaries), retrieval can become (retrieval có thể become):
- too broad (quá rộng)
- too noisy (quá nhiễu)
- too leaky (quá leak/rò rỉ)
- too hard to trust (quá khó để trust)

### Intended direction (Hướng intended)
Retrieval should increasingly be able to operate within meaningful scope, such as (Retrieval nên increasingly be able to operate within meaningful scope, như):
- workspace boundaries (ranh giới workspace)
- project boundaries (ranh giới project)
- user-specific context boundaries (ranh giới ngữ cảnh user-specific)

That is much more aligned with the product than generic global semantic lookup (Điều đó much more aligned với product hơn generic global semantic lookup).

---

## Graph Direction (Hướng Graph)

Codebase and surrounding planning (lập kế hoạch xung quanh) have pointed toward graph-first or graph-augmented thinking (đã chỉ ra hướng graph-first or graph-augmented thinking).

### What that suggests (Điều đó gợi ý gì)
Rather than treating all supporting information as isolated chunks (Thay vì treating all supporting information as isolated chunks), the platform may eventually represent and use (platform may eventually represent and use):
- relationships between concepts (mối quan hệ giữa các concepts)
- related entities or artifacts (entities hoặc artifacts liên quan)
- structured support links (structured support links)
- graph-aware relevance composition (tổ hợp relevance graph-aware)

### Why this is attractive (Tại sao điều này attractive)
A graph-aware direction can improve (Một graph-aware direction có thể improve):
- relevance precision (độ chính xác relevance)
- compositional context (ngữ cảnh compositional)
- traceability of related material (khả năng truy vết related material)
- future memory organization (tổ chức bộ nhớ tương lai)

---

## Graph as Structure, Not Hype (Graph Là Structure, Không Phải Hype)

Graph direction should be documented carefully (Graph direction nên được documented carefully).

### Good framing (Khung tốt)
- a way to represent relationships among relevant objects and ideas (một cách represent relationships giữa relevant objects và ideas)
- a support structure for retrieval/context composition (một support structure cho retrieval/context composition)
- a possible path to better memory organization (một possible path to better memory organization)

### Bad framing (Khung xấu)
- "the graph solves intelligence" ("graph solves intelligence")
- "graph means we no longer need context selection discipline" ("graph means we no longer need context selection discipline")
- "graph retrieval is automatically superior in every case" ("graph retrieval is automatically superior in every case")

Graph only matters if it makes the system more useful and more understandable (Graph only matters nếu nó makes system more useful và more understandable).

---

## Hybrid Retrieval Direction (Hướng Hybrid Retrieval)

A mature version of this architecture may eventually combine multiple retrieval/logical surfaces such as (Một mature version của architecture này may eventually combine multiple retrieval/logical surfaces như):
- semantic retrieval (retrieval semantic)
- workspace-scoped selection (lựa chọn workspace-scoped)
- graph-aware relatedness (relatedness graph-aware)
- policy-based context inclusion (bao gồm ngữ cảnh dựa trên policy)
- future profile-aware retrieval weighting (trọng số retrieval profile-aware tương lai)

This is a more realistic direction than pretending one vector search pass is the final architecture (Đây là một more realistic direction than pretending one vector search pass is the final architecture).

---

## Boundary Importance (Tầm Quan Trọng Của Boundary / Ranh Giới)

Retrieval strategy must respect the same boundary discipline as the rest of the platform (Retrieval strategy phải respect boundary discipline giống như rest of the platform).

### Important boundaries (Ranh giới quan trọng)
- workspace vs global scope
- public vs private material
- active conversation context vs durable retrieved context
- immediate relevance vs archival presence

Without these boundaries (Nếu không có các boundaries này), retrieval becomes harder to trust and easier to misuse (retrieval becomes harder to trust và easier to misuse).

---

## Risks and Failure Modes (Rủi Ro Và Các Chế Độ Thất Bại)

## 1. Flat Chunk Spam (Spam Chunk Phẳng)
Too much retrieved text enters the model without enough selection discipline (Quá nhiều retrieved text vào model without enough selection discipline).

## 2. Weak Scope Control (Kiểm Soát Phạm Vi Yếu)
Relevant material is retrieved from the wrong workspace or wrong context boundary (Relevant material is retrieved from the wrong workspace or wrong context boundary).

## 3. Semantic Nearness Without Practical Relevance (Sự Gần Gũi Semantic Không Có Practical Relevance)
The retriever returns content that is technically similar but operationally unhelpful (The retriever returns content that is technically similar but operationally unhelpful).

## 4. Overclaiming Graph Maturity (Khẳng Định Quá Mức Về Sự Chín Muồi Của Graph)
The system is described as graph-native before the real graph-backed runtime path is stable (The system is described as graph-native before the real graph-backed runtime path is stable).

## 5. Architecture by Buzzword (Kiến Trúc Bởi Buzzword)
Retrieval, memory, and graph language are used without clear boundaries or actual system roles (Retrieval, memory, and graph language are used without clear boundaries or actual system roles).

---

## Forward Direction (Hướng Tiến Tới)

The likely strong direction for Genie AI is (The likely strong direction cho Genie AI là):
- workspace-scoped retrieval
- prepared context assembly
- stronger server-side context selection
- future graph-aware support composition
- memory treated as a structured product primitive (bộ nhớ được treated as a structured product primitive)

This is a more precise and credible direction than generic "RAG-powered AI" framing (Đây là một more precise and credible direction than generic "RAG-powered AI" framing).

---

## Summary (Tóm Tắt)

The key idea is this (Ý tưởng chính là này):

**Retrieval and graph strategy should exist to improve structured context assembly inside a workspace-centric system, not to replace architecture with buzzwords.**

---

## Related Docs (Các Tài Liệu Liên Quan)

This document should be read alongside (Tài liệu này nên được đọc cùng với):
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/workspace-operating-profile-model.md`
- `docs/architecture/runtime-mode-routing.md`
- future retrieval implementation and API reference docs