# Retrieval และ Graph Strategy (กลยุทธ์ Retrieval และ Graph)

## วัตถุประสงค์

เอกสารนี้อธิบาย architectural direction (ทิศทางทางสถาปัตยกรรม) ที่เน้น retrieval (การดึงข้อมูล) และ graph-oriented ใน Genie AI

มีอยู่เพราะ platform's context and memory direction ไม่ well described (อธิบายได้ดี) โดย simple "we use RAG" label

Broader architectural goal (เป้าหมายทางสถาปัตยกรรมที่กว้างขึ้น) เป็น more specific (เฉพาะเจาะจงกว่า):
- prepared context rather than raw transcript stuffing (context ที่เตรียมไว้ แทนการเซียบ raw transcript)
- retrieval as a structured support layer (retrieval เป็น support layer ที่มีโครงสร้าง)
- future graph-aware composition rather than flat nearest-neighbor thinking alone (การ compose graph-aware ในอนาคต แทน flat nearest-neighbor thinking เพียงอย่างเดียว)

เอกสารนี้ describe (อธิบาย) direction นี้ at a high level

---

## Core Principle (หลักการพื้นฐาน)

Retrieval should support context assembly, not replace architecture (Retrieval ควร support การประกอบ context ไม่ใช่ replace architecture)

In other words (กล่าวอีกนัยหนึ่ง):
- retrieval is not the whole memory system (retrieval ไม่ใช่ทั้ง memory system)
- embeddings are not the whole intelligence layer (embeddings ไม่ใช่ทั้ง intelligence layer)
- graph structure is not valuable unless it improves relevance, boundaries, or explainability (graph structure ไม่ valuable ถ้าไม่ improve relevance, boundaries, หรือ explainability)

The point is to improve how context is selected and composed (จุดประสงค์คือ improve วิธีที่ context ถูก selected และ composed)

---

## Why "Just Use RAG" Is Not Enough (ทำไม "Just Use RAG" จึงไม่พอ)

The phrase "RAG" is often too vague to be useful architecturally (คำว่า "RAG" บ่อยครั้ง vague เกินไปที่จะ useful ทางสถาปัตยกรรม)

It can mean very different things in practice (มันสามารถหมายถึงสิ่งต่างกันมากใน practice):
- stuffing retrieved chunks into prompts (เซียบ retrieved chunks เข้า prompts)
- semantic search over documents (semantic search บน documents)
- tool-augmented retrieval flows (retrieval flows ที่ augmented ด้วย tools)
- hybrid retrieval pipelines (hybrid retrieval pipelines)
- memory systems with weak structure (memory systems ที่มี weak structure)

For Genie AI, the more important question is (สำหรับ Genie AI คำถามที่สำคัญกว่าคือ):

**what role should retrieval play inside a workspace-centric, context-prepared architecture?**

---

## Retrieval as a Support Layer (Retrieval เป็น Support Layer)

Intended direction (ทิศทางที่ตั้งใจ) คือ retrieval should help answer questions like (retrieval ควรช่วยตอบคำถามอย่าง):
- what supporting material is relevant right now? (supporting material อะไร relevant ตอนนี้)
- what workspace-linked information should influence this run? (workspace-linked information อะไรควร influence run นี้)
- what context should be elevated without bloating the prompt? (context อะไรควร elevated โดยไม่ bloating prompt)

This makes retrieval a context-selection mechanism, not an end in itself (นี่ทำให้ retrieval เป็น context-selection mechanism ไม่ใช่ end in itself)

---

## Relationship to Prepared Context (ความสัมพันธ์กับ Prepared Context)

Prepared context is the central architectural pattern (Prepared context เป็น central architectural pattern)

Retrieval and graph-aware systems should plug into that pattern by contributing (Retrieval และ graph-aware systems ควร plug เข้า pattern นั้นโดย contribute):
- relevant support material
- structured relationship context
- bounded memory cues

They should not simply dump large amounts of semantically related text into the model and call that architecture (พวกเขา not simply dump large amounts of semantically related text into the model and call that architecture)

---

## Workspace-Scoped Retrieval (Workspace-Scoped Retrieval / Retrieval ที่ Scoped โดย Workspace)

A workspace-first product needs retrieval that respects scope (Product ที่ workspace-first ต้องการ retrieval ที่ respects scope)

### Why this matters (ทำไมถึงสำคัญ)
Without workspace boundaries (โดยไม่มี workspace boundaries) retrieval can become (retrieval กลายเป็น):
- too broad (กว้างเกินไป)
- too noisy (มีเสียงรบกวนเกินไป)
- too leaky (รั่วเกินไป)
- too hard to trust (ยากเกินไปที่จะไว้วางใจ)

### Intended direction (ทิศทางที่ตั้งใจ)
Retrieval should increasingly be able to operate within meaningful scope, such as (Retrieval ควร increasingly be able to operate within meaningful scope เช่น):
- workspace boundaries
- project boundaries
- user-specific context boundaries

That is much more aligned with the product than generic global semantic lookup (นั่น aligned กับ product มากกว่า generic global semantic lookup มาก)

---

## Graph Direction (ทิศทาง Graph)

Codebase และ surrounding planning (การวางแผนรอบข้าง) have pointed toward graph-first or graph-augmented thinking

### What that suggests (สิ่งที่มัน suggest)
Rather than treating all supporting information as isolated chunks (แทนที่จะ treat ทุก supporting information เป็น isolated chunks) platform may eventually represent and use (platform อาจจะ represent และ use ในที่สุด):
- relationships between concepts (ความสัมพันธ์ระหว่าง concepts)
- related entities or artifacts (entities หรือ artifacts ที่เกี่ยวข้อง)
- structured support links (structured support links)
- graph-aware relevance composition (graph-aware relevance composition)

### Why this is attractive (ทำไมมัน attractive)
Graph-aware direction can improve (Graph-aware direction สามารถ improve):
- relevance precision
- compositional context
- traceability of related material
- future memory organization

---

## Graph as Structure, Not Hype (Graph เป็น Structure ไม่ใช่ Hype)

Graph direction should be documented carefully (Graph direction ควร documented อย่างระมัดระวัง)

### Good framing
- a way to represent relationships among relevant objects and ideas (วิธี represent relationships ระหว่าง objects และ ideas ที่ relevant)
- a support structure for retrieval/context composition (support structure สำหรับ retrieval/context composition)
- a possible path to better memory organization (a possible path to better memory organization)

### Bad framing
- "the graph solves intelligence" ("graph แก้ intelligence")
- "graph means we no longer need context selection discipline" ("graph means we no longer need context selection discipline")
- "graph retrieval is automatically superior in every case" ("graph retrieval is automatically superior in every case")

Graph only matters if it makes the system more useful and more understandable (Graph only matters ถ้ามัน make system more useful และ more understandable)

---

## Hybrid Retrieval Direction (Hybrid Retrieval Direction / ทิศทาง Hybrid Retrieval)

A mature version of this architecture may eventually combine multiple retrieval/logical surfaces such as (A mature version ของ architecture นี้อาจ eventually combine multiple retrieval/logical surfaces เช่น):
- semantic retrieval
- workspace-scoped selection
- graph-aware relatedness
- policy-based context inclusion
- future profile-aware retrieval weighting

This is a more realistic direction than pretending one vector search pass is the final architecture (นี่คือ direction ที่ realistic กว่า pretending one vector search pass is the final architecture)

---

## Boundary Importance (ความสำคัญของ Boundary)

Retrieval strategy must respect the same boundary discipline as the rest of the platform (Retrieval strategy ต้อง respect boundary discipline เดียวกับ rest of the platform)

### Important boundaries (Boundary ที่สำคัญ)
- workspace vs global scope
- public vs private material
- active conversation context vs durable retrieved context
- immediate relevance vs archival presence

Without these boundaries (โดยไม่มี boundaries เหล่านี้) retrieval becomes harder to trust and easier to misuse (retrieval กลายเป็น harder to trust และ easier to misuse)

---

## Risks and Failure Modes (ความเสี่ยงและ Failure Modes)

## 1. Flat Chunk Spam
Too much retrieved text enters the model without enough selection discipline

## 2. Weak Scope Control
Relevant material is retrieved from the wrong workspace or wrong context boundary

## 3. Semantic Nearness Without Practical Relevance
The retriever returns content that is technically similar but operationally unhelpful

## 4. Overclaiming Graph Maturity
The system is described as graph-native before the real graph-backed runtime path is stable

## 5. Architecture by Buzzword
Retrieval, memory, and graph language are used without clear boundaries or actual system roles

---

## Forward Direction (ทิศทางหน้า)

The likely strong direction for Genie AI is (The likely strong direction สำหรับ Genie AI คือ):
- workspace-scoped retrieval
- prepared context assembly
- stronger server-side context selection
- future graph-aware support composition
- memory treated as a structured product primitive

This is a more precise and credible direction than generic "RAG-powered AI" framing (นี่คือ direction ที่ precise และ credible กว่า generic "RAG-powered AI" framing)

---

## Summary (สรุป)

The key idea is this (Key idea คือ):

**Retrieval and graph strategy should exist to improve structured context assembly inside a workspace-centric system, not to replace architecture with buzzwords.**

---

## Related Docs (เอกสารเกี่ยวข้อง)

This document should be read alongside (เอกสารนี้ควรอ่านควบคู่กับ):
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/workspace-operating-profile-model.md`
- `docs/architecture/runtime-mode-routing.md`
- future retrieval implementation and API reference docs