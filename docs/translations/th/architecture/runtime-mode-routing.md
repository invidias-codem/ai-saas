# การจัดเส้นทางโหมด Runtime (Runtime Mode Routing)

## วัตถุประสงค์

เอกสารนี้อธิบายว่า Genie AI กำหนดพฤติกรรม runtime สำหรับคำขอการสนทนา (conversation requests) อย่างไร

มีอยู่เพราะแพลตฟอร์มกำลังเคลื่อนตัวออกจากโมเดล toggle โหมดแบบง่ายๆ ที่ควบคุมโดย client ไปสู่โมเดล routing (การจัดเส้นทาง) ที่ resolved โดย server และ诚实 (honest) มากขึ้น โดยอิงจาก application context

เป้าหมายของเอกสารนี้คือเพื่อชี้แจง:
- ที่ไหนที่ตัดสินใจโหมด runtime
- context อะไรที่มีอิทธิพลต่อการตัดสินใจนั้น
- conversations pre-workspace และ workspace-backed แตกต่างกันอย่างไร
- วิธี reasoning (การให้เหตุผล) เกี่ยวกับ debugging และ future extension

---

## Core Principle (หลักการพื้นฐาน)

Runtime mode ควร resolved โดย server ไม่ใช่ trusted โดยตรงจาก arbitrary client intent (เจตนาของ client ที่กำหนดเอง)

ในทางปฏิบัติ หมายถึงระบบควร derive (นำมา) runtime behavior จาก:
- conversation context
- workspace context
- operating profile context
- backend routing logic

มากกว่าจะมาจาก frontend control ที่อ้างว่าตั้ง final mode โดยตรง

---

## ทำไมถึงมีเอกสารนี้ (Why This Exists)

Product behavior ก่อนหน้านี้อาจสร้าง mismatch (ความไม่ตรงกัน) ระหว่าง:
- สิ่งที่ UI อ้างว่า mode คืออะไร
- สิ่งที่ backend ทำจริง
- สิ่งที่ user ควร expect อย่างสมเหตุสมผล

สิ่งนี้เป็นปัญหาโดยเฉพาะในระบบที่ต้องการ support:
- budget-aware behavior
- workspace-aware behavior
- profile-aware behavior
- future memory-native execution patterns

Server-resolved routing model มีความ truthful (ซื่อสัตย์) และ extensible (ขยายได้) มากกว่า

---

## High-Level Runtime Routing Model (โมเดล Routing Runtime ระดับสูง)

ในระดับสูง Conversation request ไหลผ่าน routing stages เหล่านี้:

1. request เข้าสู่ chat API layer
2. server ระบุ conversation context
3. server ระบุว่า workspace involved หรือไม่
4. server resolve operating-profile influence
5. runtime mode ถูก map server-side
6. model/provider behavior ถูกเลือกตามนั้น
7. response ส่งคืนพร้อม optional debug visibility

นี่หมายถึง backend เป็น final authority (ผู้มีอำนาจสูงสุด) เกี่ยวกับ effective runtime mode

---

## Key Context Sources (แหล่ง Context สำคัญ)

## 1. Conversation Context

Server ต้องเข้าใจก่อนว่า request 属于 (belong to) conversation ไหน

### ทำไมถึงสำคัญ
Conversation state สามารถกำหนดได้ว่า:
- request เป็นส่วนหนึ่งของ general chat flow หรือไม่
- attached กับ workspace-backed flow หรือไม่
- historical/contextual routing rules ควร apply หรือไม่

---

## 2. Workspace Context

Workspace context เป็น major architectural routing input

### ทำไมถึงสำคัญ
Workspace-backed conversation สามารถ carry (พกพา) ได้:
- organizational context ที่แข็งแกร่งกว่า
- memory expectations ที่ต่างกัน
- profile-linked runtime behavior
- future retrieval/context differences

นี่เป็นหนึ่งในเหตุผลที่ platform กำลังเคลื่อนตัวออกจาก universal chat-mode toggle model

---

## 3. Operating Profile Context

Operating profiles ตั้งใจจะ shape (รูปทรง) runtime behavior 诚实 (honestly) กว่า generic "fast vs quality" UI switch

### ทำไมถึงสำคัญ
Operating profile สามารถ express (แสดงออก) ได้:
- expected depth/behavior
- cost/latency tradeoffs
- future preference structures
- mode-selection logic aligned กับ user/workspace model

สิ่งนี้ทำให้ runtime routing เป็น platform behavior ไม่ใช่แค่ UI preference

---

## General vs Workspace-Backed Conversations

## General / Pre-Workspace Behavior

ก่อนที่ conversation จะ truly anchored (ยึดติดจริง) ใน workspace/profile structure Platform เคลื่อนไปสู่ simplified และ honest default behavior

### Practical outcome
User-facing pre-workspace mode คือ effectively:
- **General**

### ทำไม
หลีกเลี่ยงการ pretend (แซว) ว่า user กำลังเลือก deep backend mode เมื่อ server-side context สำหรับ differentiation (การแยกแยะ) อาจยังไม่มีอยู่

---

## Workspace-Backed Behavior

เมื่อ conversation associated (เชื่อมโยง) กับ workspace และ อาจ influenced โดย operating profile Runtime routing จะกลายเป็น context-sensitive มากขึ้น

### Practical outcome
Effective mode สามารถ derive (นำมา) ได้จาก:
- workspace state
- operating profile signals
- backend mapping logic

นี่คือที่ที่ advanced runtime architecture เหมาะสม

---

## Server-Side Resolution (การ Resolve ฝั่ง Server)

Current architectural direction คือ chat route ควร resolve runtime mode บน server

### ทำไมถึงสำคัญ
Ensure (รับประกัน) ว่า:
- effective mode match จริงกับ backend logic
- UI simplification ไม่ลด backend flexibility
- future routing rules evolve ได้โดยไม่ lying to user
- debugging focus ได้ที่ one authoritative routing layer

---

## Relationship to UI Controls (ความสัมพันธ์กับ UI Controls)

## Old mental model
User tap client-side mode switch และ mode ก็คือ whatever client says

## Current direction
Client อาจ expose limited UX state แต่ backend determine effective runtime behavior

### ทำไมถึงสำคัญ
Prevent class ของ misleading UX ที่:
- UI suggest หนึ่ง behavior
- Server silently ทำอีกอย่าง

Smaller, more honest client surface > larger fake-control surface

---

## Debugging Aids (ช่วยเหลือการ Debug)

System ใช้ debug headers ทำ runtime behavior 更 inspectable (ตรวจสอบง่ายขึ้น)

### Known examples
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

### ทำไมช่วย
Allow team ไป verify:
- mode 何 server actually resolved
- model path 何 chosen
- runtime routing align กับ expectations under different conversation/workspace states

Headers เหล่านี้ useful มากเมื่อ debugging differences ระหว่าง:
- general conversation flows
- workspace-backed conversation flows
- profile-influenced routing

---

## Current Architectural Intent (เจตนาสถาปัตยกรรมปัจจุบัน)

Runtime routing ควร increasingly reflect principle นี้:

> system should choose behavior based on application context 而不是 asking user to simulate backend routing manually

Nี่ aligned กับ broader platform direction:
- workspace-centric behavior
- operating-profile-derived runtime logic
- memory/context-aware execution

---

## Common Failure Modes (โหมดล้มเหลวทั่วไป)

## 1. UI/Backend Mismatch
Frontend present mode label ที่ไม่ match actual backend routing behavior

## 2. Context Loss
Backend fail recover สิ่ง conversation/workspace/profile context ที่ถูกต้อง ทำให้ fallback ไป less specific mode

## 3. Debug Opacity
System resolve mode internally แต่ให้ too little visibility for verification

## 4. Overgrowth of Client Controls
Frontend accumulates (สะสม) too many mode toggles ก่อนที่ backend context model mature พอที่จะ justify

---

## Why "General" Matters (ทำไม "General" จึงสำคัญ)

การ introduce simpler **General** mode บน pre-workspace flows ไม่ใช่ regression
เป็น truthfulness improvement (การปรับปรุงความซื่อสัตย์)

### What it avoids (สิ่งที่มันหลีกเลี่ยง)
- fake precision ใน UI
- premature exposure ของ backend routing complexity
- misleading promises 关于 control ที่ backend ไม่ truly honor yet

### What it enables (สิ่งที่มัน enable)
- cleaner runtime architecture
- stronger future workspace/profile routing
- simpler debugging
- more trustworthy UX

---

## Forward Direction (ทิศทางหน้า)

Routing model นี้กลายเป็น powerful มากขึ้นเมื่อ other systems mature โดยเฉพาะ:
- operating profile design
- memory/context preparation
- workspace-first application flows
- retrieval and context-layer composition

Over time runtime mode routing กลายเป็น richer policy layer 而不是 simple mode switch

---

## Recommended Related Docs (เอกสารเกี่ยวข้องที่แนะนำ)

เอกสารนี้ควรอ่าน alongside (ควบคู่) กับ:
- `docs/architecture/system-architecture.md`
- `docs/security/public-routes.md`
- future `docs/architecture/memory-and-context-architecture.md`
- future API/runtime reference docs

---

## Summary (สรุป)

Most important idea 很简单:

**Genie AI should resolve runtime behavior from context on the server, not pretend the client alone controls the final mode.**

That is the backbone of a more honest and more extensible AI platform architecture.