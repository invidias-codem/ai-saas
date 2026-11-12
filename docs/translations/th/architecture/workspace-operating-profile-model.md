# โมเดล Workspace และ Operating Profile

## วัตถุประสงค์

เอกสารนี้อธิบายความสัมพันธ์ระหว่าง **workspaces** และ **operating profiles** ใน Genie AI

มีอยู่เพราะโมเดลนี้เป็นหนึ่งใน shifts สำคัญที่สุดใน platform architecture และ product identity

Genie AI กำลัง evolve (พัฒนา) ออกจาก pattern "chat plus tool pages" ที่ simpler ไปสู่ structured system ที่:
- workspace เป็น primary organizational container
- operating profile shape runtime behavior
- conversations increasingly inherit context จาก structure นั้น

เอกสารนี้ clarify (ชี้แจง) โมเดลนี้ที่ conceptual และ architectural level

---

## Core Principle (หลักการพื้นฐาน)

Platform ไม่ควร treat (จัดการ) every conversation as a contextless generic chat thread

แทนที่จะเป็นอย่างนั้น:
- **workspace** provides the container
- **operating profile** provides behavioral shape
- **conversation** becomes an active thread inside that structure

นี่คือ backbone ของ product ที่ more memory-native, cost-aware, และ context-aware

---

## Why This Model Exists (ทำไมโมเดลนี้ถึงมีอยู่)

Generic chatbot model tends to flatten (แปลง) everything into one surface:
- same context assumptions
- same runtime assumptions
- same cost/quality assumptions
- weak organizational boundaries

Approach นั้น breaks down (ล้มเหลว) เมื่อ platform wants to support:
- differentiated runtime behavior
- stronger context preparation
- meaningful user organization
- future memory boundaries
- budget-conscious product strategy

Workspace + operating-profile model intended to solve that

---

## Primary Objects (วัตถุหลัก)

## 1. Workspace

### What it is (มันคืออะไร)
Workspace คือ primary container สำหรับ meaningful unit of user activity

### What it represents (มัน represent อะไร)
Workspace สามารถ represent ได้:
- a project (โปรเจกต์)
- a domain of work (โดเมนของงาน)
- a persistent context container
- a future memory boundary
- a runtime-scoping unit

### Why it matters (ทำไมถึงสำคัญ)
Workspace gives platform a place to attach (ให้แพลตฟอร์มที่จะ attach):
- conversations
- memory/context behavior
- future knowledge structures
- profile-shaped runtime assumptions

Without a real workspace model (โดยไม่มี workspace model จริง) context and behavior stay too flat (คงคง flat)

---

## 2. Operating Profile

### What it is
Operating profile คือ structured description ของว่าระบบควร behave อย่างไรสำหรับ given user/workspace context

### What it influences (มันมีอิทธิพลต่ออะไร)
Operating profile สามารถ shape (รูปทรง) ได้:
- runtime mode selection
- cost/latency/quality tradeoffs
- future context-selection policies
- style and system behavior expectations
- how the platform balances capability with efficiency

### Why it matters
Operating profile คือ more honest and extensible (ซื่อสัตย์และขยายได้มากกว่า) than exposing a simplistic "fast / quality / agentic" mode toggle without enough backend context to support it properly

---

## 3. Conversation

### What it is
Conversation คือ active interaction thread ภายใน workspace/profile model

### Why it matters
Conversation ไม่ควร treated as a free-floating isolated object by default (ถูกจัดการเป็น isolated object ที่ลอยฟรีโดยค่าเริ่มต้น)

แทนที่จะเป็นอย่างนั้น conversation increasingly derives meaning from (derive ความหมายจาก):
- its workspace membership
- its profile-linked runtime behavior
- future memory/context layers attached to that structure

---

## Relationship Between the Three (ความสัมพันธ์ระหว่างสามอย่าง)

At a conceptual level:
- **workspace** = where the work lives (ที่ไหนที่งานอยู่)
- **operating profile** = how the system should behave in that environment (ระบบควร behave อย่างไรใน environment นั้น)
- **conversation** = the active thread happening within that structure (active thread ที่เกิดขึ้นภายใน structure นั้น)

Relationship นี้เป็นหนึ่งใน most important product abstractions ใน Genie AI

---

## Workspace as Primary Container (Workspace เป็น Primary Container)

Platform direction increasingly treats workspace as the main runtime container

### Why this is important
Workspace สามารถ anchor (ยึด) ได้:
- organizational identity
- memory scope
- future retrieval scope
- runtime policy
- conversation grouping

### Architectural implication
This means workspace is not just a sidebar label or cosmetic folder
It is intended to become part of the real runtime model

---

## Operating Profile as Runtime Policy Layer (Operating Profile เป็น Runtime Policy Layer)

Operating profile should be understood as a policy layer rather than just a preference label

### It can eventually express things like
- whether behavior should optimize more for speed or depth
- whether certain workflow patterns are expected
- what kind of context assembly is appropriate
- how to trade off capability, cost, and latency in a more structured way

### Why this matters
This creates differentiation without pretending there is one universally optimal expensive mode for every conversation

It also aligns with the broader product direction of being more budget-aware and profile-shaped rather than "one premium mode for everything"

---

## Why This Is Better Than Generic Chat Modes (ทำไมมันดีกว่า Generic Chat Modes)

Simple client-side mode switch is easy to expose, but weak architecturally

### Problems with naive chat modes
- they can misrepresent what the backend actually does
- they ignore workspace context
- they do not scale well into memory-aware behavior
- they often create fake precision in the UI

### Advantages of workspace + operating profile
- behavior can be derived from richer context
- runtime routing becomes more honest
- product behavior becomes more composable
- future memory/retrieval layers have a stable container model

---

## Relationship to Runtime Mode Routing (ความสัมพันธ์กับ Runtime Mode Routing)

Workspace/operating-profile model is one of the main reasons runtime mode routing moved toward server-side resolution

### Why
Backend needs to inspect:
- what conversation this is
- which workspace it belongs to
- whether a profile should shape behavior

This is stronger than asking the client to guess the final mode manually

---

## Relationship to Memory and Context Architecture (ความสัมพันธ์กับ Memory and Context Architecture)

Workspace/operating-profile model also matters เพราะ memory and context preparation need boundaries

### Workspace can provide
- context scope
- memory container identity
- future retrieval boundary

### Operating profile can provide
- context-selection policy hints
- expected behavior shape
- future memory/runtime balancing rules

This is why these systems should be understood together, not independently

---

## General / Pre-Workspace Flows

Platform still needs to support users before full workspace anchoring is established

### Current design implication
Pre-workspace or lightly-scoped chat is intentionally simplified and more honest

### Example
The move toward a single **General** pre-workspace mode reflects this

### Why
It avoids pretending that the platform already has the rich workspace/profile context needed to justify deeper backend behavioral differentiation

---

## Onboarding Implications (นัยสำคัญของ Onboarding)

Meaningful onboarding flow should not only create a user account
It should help instantiate the actual runtime structure of the platform

### In practical terms, onboarding should move toward creating
- a personalized operating profile
- a starter workspace
- a starter conversation/path into that workspace

### Why this matters
This makes onboarding part of the architecture, not just account setup

---

## Cost and Product Strategy Implications (นัยสำคัญของต้นทุนและกลยุทธ์ผลิตภัณฑ์)

This model also supports an important product strategy idea:

### Instead of (แทนที่จะเป็น)
one default expensive "best" mode for everyone,

### the platform can aim for (แพลตฟอร์มสามารถมุ่งมั่นได้)
profile-shaped runtime economics and behavior

That allows the product to pursue (นั่นช่วยให้ผลิตภัณฑ์追求ได้):
- stronger alignment between user needs and system behavior
- better cost discipline
- more meaningful differentiation at a lower price point

This is a serious product advantage if implemented honestly

---

## Common Failure Modes (โหมดล้มเหลวทั่วไป)

## 1. Workspace as Cosmetic Shell
Workspace exists in the UI but does not actually influence runtime/context behavior

## 2. Operating Profile as Empty Label
Profile exists in the DB/UI but does not shape real backend behavior

## 3. Conversation Re-Centralization
System keeps falling back to treating conversations as the real primary object, undermining the workspace model

## 4. UI Promises Ahead of Backend Reality
Frontend exposes profile/mode controls that the backend cannot yet honor faithfully

## 5. Onboarding Without Runtime Structure
Users appear "set up" but do not actually have the workspace/profile state needed for the intended architecture

---

## Honest Product Framing (การจัดกรอบผลิตภัณฑ์อย่างซื่อสัตย์)

Workspace/operating-profile model should be described plainly (ควรอธิบายอย่างชัดเจน)

### Good framing
- workspaces organize active context and future memory scope
- operating profiles help shape backend behavior
- conversations live inside that structure
- runtime behavior is increasingly resolved from this model server-side

### Bad framing
- "the AI automatically becomes whatever you want everywhere instantly"
- "profiles guarantee perfect intelligence mode selection"
- "workspace means folder, but also everything else somehow"

Precision builds trust (ความแม่นยำสร้างความไว้วางใจ)

---

## Forward Direction (ทิศทางหน้า)

This model becomes more valuable as the rest of the platform matures:
- server-side runtime routing
- prepared context pipelines
- memory-native behavior
- graph/retrieval augmentation
- workspace-scoped persistence and knowledge behavior

The more those systems become real, the more important the workspace/operating-profile abstraction becomes

---

## Summary (สรุป)

Key idea is this:

**Workspace defines where the work lives. Operating profile helps define how the system should behave there. Conversation is the active thread inside that structure.**

That is one of the central architectural ideas in Genie AI's evolution beyond a generic chatbot product.

---

## Related Docs (เอกสารเกี่ยวข้อง)

This document should be read alongside:
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- `docs/architecture/memory-and-context-architecture.md`
- future onboarding, API, and ADR documentation