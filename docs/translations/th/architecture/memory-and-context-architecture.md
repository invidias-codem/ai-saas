# สถาปัตยกรรม Memory และ Context

## วัตถุประสงค์

เอกสารนี้อธิบายว่า Genie AI กำลังพัฒนา (evolving) สถาปัตยกรรม memory และ context อย่างไร

มีอยู่เพื่อทำให้ core product direction (ทิศทางผลิตภัณฑ์หลัก) ชัดเจน:
Genie AI ไม่ได้ตั้งใจจะอยู่เป็น thin chat wrapper (wrapper บาง) รอบ raw rolling history (ประวัติแบบดิบที่เลื่อน) มันกำลังเคลื่อนไปสู่ prepared-context architecture ที่มีโครงสร้างมากขึ้น workspace-aware (รับรู้ workspace) พร้อม stronger boundaries (ขอบเขตที่แข็งแกร่งขึ้น) ระหว่าง conversation state, workspace state, retrieved context, และ future memory systems

เอกสารนี้ focus (เน้น) ที่ architectural intent (เจตนาสถาปัตยกรรม), current patterns (รูปแบบปัจจุบัน), และ design direction แทนที่จะ claim (อ้าง) ว่าทุก future subsystem realized (สำเร็จ) แล้ว

---

## Core Principle (หลักการพื้นฐาน)

Context ควร **prepared** (เตรียมไว้) ไม่ใช่ merely accumulated (แค่สะสม)

นี่หมายถึง system ควร increasingly avoid (หลีกเลี่ยงมากขึ้น) treating "everything in history" ว่าเป็น only หรือ best source ของ model context

แทนที่จะเป็นอย่างนั้น context ควร assembled (ประกอบ) จาก multiple layers (หลายชั้น) เช่น:
- immediate conversation state
- workspace context
- operating-profile context
- retrieved supporting information
- future memory layers

Architecture นี้ controllable (ควบคุมได้) มากกว่า extensible (ขยายได้) มากกว่า และ honest (ซื่อสัตย์) มากกว่า เกี่ยวกับสิ่งที่ system actually using

---

## Why This Matters (ทำไมถึงสำคัญ)

Naive chat architecture tends to degrade (ลดลง) เข้าสู่หนึ่งในสอง patterns:

1. **raw transcript stuffing** (การเซียบ transcript แบบดิบ)
   - too much irrelevant history (ประวัติที่ไม่เกี่ยวข้องมากเกินไป)
   - unclear relevance (relevance ไม่ชัดเจน)
   - context-window waste (การสูญเสีย context window)
   - weaker prompt discipline (การวินัย prompt อ่อนแอลง)

2. **opaque hidden retrieval behavior** (พฤติกรรม retrieval ที่ซ่อนและโปร่งแสงไม่ได้)
   - users และ developers cannot tell (บอกไม่ได้) what information influenced the answer
   - debugging becomes difficult (การ debug กลายเป็นยาก)
   - architecture becomes fragile and magical (สถาปัตยกรรมเปราะบางและเหมือนเวทมนตร์)

Prepared context intended to provide (ตั้งใจให้) better middle path (ทางกลางที่ดีกว่า)

---

## Architectural Layers of Context (ชั้นสถาปัตยกรรมของ Context)

At a high level (ในระดับสูง) Genie AI's context architecture ควร understood (เข้าใจ) ว่าเป็น multiple cooperating layers (ชั้นที่ร่วมมือกันหลายชั้น)

## 1. Immediate Conversation Context (Context การสนทนาทันที)

นี่คือ near-term interaction state (สถานะการโต้ตอบระยะสั้น) directly associated with (เกี่ยวข้องโดยตรงกับ) active conversation

### Typical contents (เนื้อหาปกติ)
- recent user/assistant turns (เทิร์นล่าสุดของ user/assistant)
- active prompt/interaction state
- immediate request framing

### Role (บทบาท)
This provides local conversational coherence (ความสอดคล้องของการสนทนาในท้องถิ่น)

### Limitation (ข้อจำกัด)
Immediate conversation context alone (เพียงอย่างเดียว) not enough สำหรับ workspace-centric, memory-aware product

---

## 2. Workspace Context

Workspace context เป็น major architectural layer เพราะ product moving toward workspace-first behavior

### Typical contents
- workspace identity
- workspace-linked conversation scope
- relevant persistent organizational context
- future workspace memory boundaries

### Role
Workspace context allows system to behave as though (เหมือนว่า) conversation belongs to a meaningful container แทน isolated free-floating thread

### Why it matters (ทำไมถึงสำคัญ)
นี่คือหนึ่งใน core differences (ความแตกต่างหลัก) ระหว่าง generic chatbot และ structured intelligence workspace ที่มีโครงสร้างมากขึ้น

---

## 3. Operating Profile Context

Operating profiles intended to shape (รูปทรง) runtime behavior และ increasingly (เพิ่มขึ้น) context behavior ด้วย

### Potential influence (อิทธิพลที่เป็นไปได้)
Operating profile สามารถ affect (ส่งผลต่อ) ได้:
- style of system behavior
- expected depth
- runtime tradeoffs
- future context-selection policies

### Architectural role
Operating profiles help tie (เชื่อม) context architecture ไปยัง broader platform model แทนที่จะ leaving (ทิ้ง) memory/context as a disconnected subsystem

---

## 4. Retrieved Supporting Context (Context ที่สนับสนุนและถูก Retrieve)

System direction รวมถึง retrieving supporting information แทนที่จะ relying only on (พึ่งพาแค่) conversation transcripts

### Potential sources (แหล่งที่เป็นไปได้)
- curated memory layers
- future graph-aware retrieval
- structured workspace materials
- externally ingested knowledge in bounded contexts

### Role
Retrieved context should provide relevance (ความเกี่ยวข้อง) not indiscriminate bulk (ปริมาณโดยไม่คัดเลือก)

### Important note (หมายเหตุสำคัญ)
Retrieved context must be prepared และ bounded carefully (จำกัดอย่างระมัดระวัง) Retrieval helpful (มีประโยชน์) only when it improves relevance และ traceability (ความสามารถในการติดตาม) rather than adding prompt noise

---

## 5. Future Durable Memory Layers (ชั้น Memory ที่ทนทนในอนาคต)

Architecture direction ชี้ชัดไปทาง durable memory concepts ที่ทนทนมากขึ้น แต่ they should be described carefully (ควรอธิบายอย่างระมัดระวัง)

### Memory should not be treated as a single blob (Memory ไม่ควรถือเป็น blob เดียว)
Useful future memory system likely involve multiple classes of memory เช่น:
- short-horizon active context
- workspace-linked durable context
- structured recall surfaces
- future graph or retrieval-enhanced memory

### Why this matters
Calling everything "memory" without distinctions (การแยกแยะ) makes system harder to reason about (ยากที่จะให้เหตุผล) และ easier to misrepresent (ง่ายที่จะนำเสนอผิด)

---

## Prepared Context as the Central Pattern (Prepared Context เป็น Central Pattern)

Prepared-context idea เป็นหนึ่งใน most important architectural patterns ใน Genie AI

### What it means (สิ่งที่มันหมายถึง)
Rather than passing through raw state as-is (แทนที่จะผ่าน raw state เหมือนเดิม) system prepares a context package for model execution

### A prepared context may include (Prepared context อาจรวมถึง)
- selected conversation history
- explicit prompt sections
- workspace-derived framing
- retrieved supporting material
- system instructions organized by purpose

### Why this is better (ทำไมถึงดีกว่า)
It enables (มันทำให้เป็นไปได้):
- cleaner prompt construction
- more intentional relevance
- easier debugging
- future policy control over what enters model context
- reduced dependence on transcript bloat

---

## Relationship to Memory-Native Direction (ความสัมพันธ์กับ Memory-Native Direction)

Product direction has increasingly emphasized (เน้นมากขึ้น) memory-native architecture

This should be interpreted carefully (ควรตีความอย่างระมัดระวัง)

### It does not simply mean (มันไม่ได้แค่หมายถึง)
- "we save lots of text" (เราเซฟข้อความเยอะ)
- "we have embeddings somewhere" (เรามี embeddings ที่ไหนสักที่)
- "the assistant remembers everything magically" (assistant จดทุกอย่างได้แบบเวทมนตร์)

### It should mean (มันควรหมายถึง)
- memory is treated as a product primitive (memory ถูกจัดการเป็น product primitive)
- context assembly has explicit architecture (การประกอบ context มี architecture ที่ชัดเจน)
- workspace and runtime behavior can draw from more than a raw chat log
- system is designed for structured recall and future evolution

This is a stronger and more credible interpretation (นี่คือ interpretation ที่แข็งแกร่งและน่าเชื่อถือกว่า)

---

## Graph and Retrieval Direction (ทิศทาง Graph และ Retrieval)

Codebase และ surrounding planning (การวางแผนรอบข้าง) pointed toward (ชี้ไป) graph-first or graph-augmented retrieval ideas

### Why this matters
Graph-aware direction suggests (ชี้ให้เห็น) system may eventually treat (อาจจะจัดการในที่สุด) relationships between concepts, materials, และ workspace objects as first-class retrieval structure แทนที่จะ relying only on (พึ่งพาแค่) flat nearest-neighbor lookup

### Architectural implication (นัยสำคัญทางสถาปัตยกรรม)
If this direction matures (หากทิศทางนี้โตเต็มที่) memory/context assembly could increasingly involve (อาจเกี่ยวข้องมากขึ้น):
- relevance selection
- relationship-aware context composition
- structured support rather than raw passage dumping

### Caution (ข้อควรระวัง)
This should be documented as a direction unless and until (นี่ควรถูกบันทึกเป็นทิศทาง เว้นแต่และจนกว่า) full production path implemented and stabilized

---

## Boundaries Matter (ขอบเขตสำคัญ / Boundaries สำคัญ)

One of the most important parts of a serious memory/context system is boundary discipline (วินัยขอบเขต)

### Boundaries that matter (ขอบเขตที่สำคัญ)
- conversation vs workspace context
- user-visible history vs hidden support context
- temporary context vs durable memory
- public data vs protected internal state
- retrieved assistance vs system-owned instructions

Without these boundaries (โดยไม่มีขอบเขตเหล่านี้) system becomes harder to trust (ยากที่จะไว้วางใจ) และ harder to debug

---

## Debuggability and Transparency (ความสามารถในการ Debug และความโปร่งใส)

Memory/context architecture is only useful if it can be inspected and reasoned about (มีประโยชน์ก็ต่อเมื่อตรวจสอบและให้เหตุผลได้)

### Good architectural properties (คุณสมบัติทางสถาปัตยกรรมที่ดี)
- developers can explain what kinds of context are being assembled
- runtime behavior can be debugged when retrieval/context selection feels wrong
- system behavior is not framed as mystical total recall

### Why this matters
Users and developers should not have to guess (ต้องเดา) whether an answer came from:
- recent turns
- workspace framing
- retrieved support data
- hidden durable memory

Even if every internal detail is not exposed in the UI (แม้ทุกรายละเอียด internal จะไม่ exposed ใน UI) architecture must remain understandable internally (สถาปัตยกรรมต้องคงเหลือเข้าใจได้ภายใน)

---

## Common Failure Modes (โหมดล้มเหลวทั่วไป)

## 1. Transcript Bloat (การพองตัวของ Transcript)
Too much raw history enters the prompt without useful selection

## 2. Weak Relevance Selection (การเลือก Relevance ที่อ่อนแอ)
Retrieved material is technically related but not actually useful

## 3. Hidden Context Confusion (ความสับสนของ Hidden Context)
System uses background context that is hard to explain or trace (ยากที่จะอธิบายหรือติดตาม)

## 4. Boundary Collapse (การล้มลงของ Boundary)
Workspace context, conversation context, และ durable memory are treated interchangeably (ถูกจัดการเหมือนกัน)

## 5. Overclaiming Memory (การอ้าง Memory เกินจริง)
Product presents an impression of stronger persistent understanding than the actual system reliably supports

---

## Honest Product Framing (การจัดกรอบผลิตภัณฑ์อย่างซื่อสัตย์)

Transparent memory/context architecture should avoid vague claims like (ควหลีกเลี่ยง vague claims เช่น):
- "the AI remembers everything" (AI จดทุกอย่าง)
- "the AI truly understands your world" (AI เข้าใจโลกของคุณจริงๆ)

A more honest framing is (การจัดกรอบที่ซื่อสัตย์กว่าคือ):
- the platform prepares context from multiple relevant layers
- workspaces and profiles help scope behavior
- memory and retrieval are being structured as part of the product architecture
- context is assembled intentionally rather than relying on raw transcript growth alone

This style of explanation builds more trust than inflated language (สไตล์การอธิบายนี้สร้าง trust มากกว่า language ที่誇張 (inflated))

---

## Relationship to Runtime Mode Routing (ความสัมพันธ์กับ Runtime Mode Routing)

Memory/context architecture and runtime mode routing are closely related (เกี่ยวข้องใกล้ชิด)

### Why (ทำไม)
Different runtime behaviors may increasingly depend on (อาจขึ้นอยู่กับมากขึ้น):
- how much context is assembled (context ประกอบได้เท่าไหร่)
- which layers are included (layer ไหนถูกรวม)
- how workspace/profile logic influences selection (logic workspace/profile ส่งผลต่อ selection อย่างไร)

This is why memory/context cannot be treated as separate from the rest of the system architecture (นี่คือเหตุผลที่ memory/context ไม่สามารถถือว่า separate จาก architecture ส่วนที่เหลือของระบบได้)

---

## Forward Direction (ทิศทางหน้า)

Likely evolution path (เส้นทาง演化ที่เป็นไปได้) สำหรับ Genie AI's context architecture includes (รวมถึง):
- stronger prepared-context pipelines
- richer workspace-scoped memory behavior
- better server-side control over context selection
- future graph/retrieval augmentation
- improved transparency and debuggability

The goal is not maximal hidden complexity (เป้าหมายไม่ใช่ complexity ที่ซ่อนอยู่สูงสุด)
The goal is **better relevance, stronger structure, and more truthful system behavior** (เป้าหมายคือ relevance ดีขึ้น structure แข็งแกร่งขึ้น และ system behavior ที่ truthful มากขึ้น)

---

## Summary (สรุป)

Key idea is this (Key idea คือ):

**Genie AI should assemble context from structured layers rather than pretending raw chat history alone is a sufficient memory system.**

That is the foundation of a more serious memory-native platform architecture (นั่นคือ foundation ของ memory-native platform architecture ที่จริงจังมากขึ้น)

---

## Recommended Related Docs (เอกสารเกี่ยวข้องที่แนะนำ)

This document should be read alongside (ควรอ่านควบคู่กับ):
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- future docs on retrieval, API behavior, and trust boundaries