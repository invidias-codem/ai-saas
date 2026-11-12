# สถาปัตยกรรมระบบ

Lattice OS เป็นแพลตฟอร์ม AI ที่ให้ความสำคัญกับ workspace (พื้นที่ทำงาน) รับรู้ operating profile (โปรไฟล์การทำงาน) และเป็น memory-native (เนื้อความในหน่วยความจำ) การนำไปปฏิบัติจัดระเบียบเป็น monorepo ที่จัดการด้วย pnpm ซึ่งแยก logic ที่เป็น platform-agnostic (ไม่ผูกกับแพลตฟอร์ม) ออกจาก delivery-specific adapters (แอดออปเตอร์เฉพาะการส่งมอบ)

## โครงสร้าง Monorepo

| แพ็กเกจ | บทบาท |
|---------|------|
| `apps/web` | Frontend Next.js 14+ (app router, Clerk auth, UI) |
| `packages/lattice-core` | Contracts ที่ตรวจสอบด้วย Zod, constants, schemas ใบอนุญาต/preflight |
| `packages/lattice-mcp-local` | Local MCP stdio adapter |
| `packages/lattice-mcp-remote` | Remote MCP HTTP adapter (ยืนยันตัวตนด้วย Clerk) |
| `packages/lattice-ai-skills` | AI Skills adapter: SKILL.md schema, slash commands, wrappers, Custom GPT manifest |

แอป Next.js ราก (root) ขึ้นอยู่กับแพ็กเกจ workspace ในเวอร์ชัน `workspace:*` และสร้าง (build) ในขั้นตอน `prebuild`

## การแม็ปเลเยอร์ (Layer Mapping)

| เลเยอร์ทางสถาปัตยกรรม | การนำไปปฏิบัติ |
|---------------------|----------------|
| Public web surface (พื้นผิวเว็บสาธารณะ) | `app/(landing)/*` และ `app/(public)/beta/*` |
| Authenticated surface (พื้นผิวที่ยืนยันตัวตนแล้ว) | `app/(dashboard)/*` ด้วย Clerk middleware |
| API/server behavior (พฤติกรรม API/เซิร์ฟเวอร์) | Route handlers `app/api/**/*` |
| Persistence (การทำให้คงอยู่) | Supabase + PostgreSQL (ฝั่งเซิร์ฟเวอร์เท่านั้น) |
| Automation/integration (อัตโนมัติ/การรวม) | Cron jobs, webhook routes, MCP adapters |
| Terminal / Raw SSE | `/api/cli/stream`, `/api/memory/cli`, local CLI shim path |

## Build & Deploy

- ลำดับ Build: `prebuild` รัน `pnpm --dir packages/lattice-{core,mcp-local,mcp-remote,ai-skills} run build` ก่อน เพื่อให้ `dist/` มีอยู่ก่อน Next.js bundling
- Vercel: `.vercelignore` อนุญาต `packages/lattice-*` (เฉพาะ `packages/ucol-node/` ถูก exclude) การแก้ไข prebuild และ NFT-scoped dynamic require อยู่ใน `package.json` และ `next.config.mjs`

---
...
เอกสารนี้ให้คำอธิบายระดับสูงของสถาปัตยกรรมระบบปัจจุบันของ Lattice OS

มีจุดประสงค์เพื่อตอบ:
- เลเยอร์หลักของระบบมีอะไรบ้าง
- คำขอ (requests) เคลื่อนที่ผ่านระบบอย่างไร
- State (สถานะ) อยู่ที่ไหน
- พื้นผิวสาธารณะ สำหรับผู้ยืนยันตัวตน และ backend automation แตกต่างกันอย่างไร
- ธีมสถาปัตยกรรมไหนเป็นศูนย์กลางของทิศทางผลิตภัณฑ์

เอกสารนี้เป็นภาพรวมสถาปัตยกรรมหลัก (backbone) ไม่ใช่ spec ของระบบย่อยเต็มรูปแบบ

---

## มุมมองระดับสูง (High-Level View)

ในภาพรวม Lattice OS ประกอบด้วยเลเยอร์สถาปัตยกรรมหลัก 6 เลเยอร์:

1. **Public web surface (พื้นผิวเว็บสาธารณะ)**
2. **Authenticated application surface (พื้นผิวแอปที่ยืนยันตัวตนแล้ว)**
3. **API and server behavior layer (เลเยอร์พฤติกรรม API และเซิร์ฟเวอร์)**
4. **Data / Persistence layer (เลเยอร์ข้อมูล/การทำให้คงอยู่)**
5. **Automation / Integration layer (เลเยอร์อัตโนมัติ/การรวม)**
6. **Terminal / Raw SSE layer (เลเยอร์ Terminal / Raw SSE)**

เลเยอร์เหล่านี้เชื่อมต่อกัน แต่ให้บริการผู้ชมที่ต่างกันและมี trust boundaries (ขอบเขตความไว้วางใจ) ที่ต่างกัน

---

## 1. Public Web Surface (พื้นผิวเว็บสาธารณะ)

### ประกอบด้วย
- landing pages (หน้าแรก)
- public informational pages (หน้าข้อมูลสาธารณะ)
- blog/docs/support/privacy pages
- marketing/informational surfaces อื่นๆ ที่ไม่ต้องยืนยันตัวตน

### หน้าที่
- อธิบายผลิตภัณฑ์
- รองรับการค้นพบ (discovery)
- จุดเข้าเอกสารและสนับสนุนสาธารณะ
- นำทางผู้ใช้ไปยัง sign-up หรือ product surfaces เมื่อเหมาะสม

### หมายเหตุทางสถาปัตยกรรม
- routes นี้ควรเข้าถึงได้สาธารณะ
- ควรไม่ได้รับสมมติฐานของ authenticated dashboard โดยบังเอิญ
- Route gating bugs ที่เลเยอร์นี้สร้าง user-facing trust issues ได้อย่างรวดเร็ว

---

## 2. Authenticated Application Surface (พื้นผิวแอปที่ยืนยันตัวตนแล้ว)

### ประกอบด้วย
- dashboard
- conversations (การสนทนา)
- workspaces (พื้นที่ทำงาน)
- onboarding
- settings (การตั้งค่า)
- user-specific application flows อื่นๆ

### หน้าที่
- จัดเก็บ product state ที่เฉพาะเจาะจงต่อผู้ใช้
- ขับเคลื่อน AI interaction workflows จริง
- เปิดเผยพฤติกรรมที่รับรู้ workspace และ profile
- ให้ product functionality แทนที่จะเป็นแค่ marketing/informational content

### หมายเหตุทางสถาปัตยกรรม
- เลเยอร์นี้ขึ้นอยู่กับ authenticated identity
- ขึ้นอยู่กับ workspace และ operating-profile context มากขึ้น
- ไม่ควรถือว่าเป็นระบบเดียวกับ landing surface ที่เพิ่ม auth ขึ้นไป

---

## 3. API and Server Behavior Layer (เลเยอร์พฤติกรรม API และเซิร์ฟเวอร์)

### ประกอบด้วย
- Route handlers ภายใต้ `app/api/...`
- Server-side runtime selection logic
- Conversation orchestration logic
- Integration callbacks และ cron endpoints

### หน้าที่
- ประมวลผล chat และ application actions
- Resolve server-side behavior
- ให้ structured interfaces ระหว่าง UI และ backend logic
- บังคับใช้ protected/public API boundaries
- รองรับ scheduled และ external workflows

### ทิศทางทางสถาปัตยกรรมที่สำคัญ
ทิศทางสำคัญในระบบคือการย้าย behavioral truth มากขึ้นไปที่ server layer โดยเฉพาะเรื่อง:
- Runtime mode selection
- Workspace-aware behavior
- Operating-profile-aware decision making

สิ่งนี้ลด misleading client-side state และทำให้ behavior inspectable (ตรวจสอบได้) มากขึ้น

---

## 4. Data / Persistence Layer (เลเยอร์ข้อมูล/การทำให้คงอยู่)

### ประกอบด้วย
- Supabase / PostgreSQL-backed structured data
- Relational application state
- Emerging memory/retrieval-related state และ supporting persistence

### หน้าที่
- Persist (ทำให้คงอยู่) user/application data
- รองรับ workspace และ profile models
- Back (รองรับ) conversations และ product structures อื่นๆ
- รองรับ scheduled/integration workflows ที่ต้องการ durable state

### หมายเหตุทางสถาปัตยกรรม
Persistence layer ไม่ใช่แค่ passive storage bucket มันรองรับ architectural transitions ในผลิตภัณฑ์มากขึ้น โดยเฉพาะเรื่อง:
- Workspace-first behavior
- Profile-derived runtime decisions
- Memory/context system evolution

---

## 5. Automation / Integration Layer (เลเยอร์อัตโนมัติ/การรวม)

### ประกอบด้วย
- Cron-triggered routes
- Webhook endpoints
- Integration callbacks
- Social/distribution automation
- External messaging/integration flows

### หน้าที่
- จัดการ scheduled tasks
- จัดการ external platform events
- Maintain non-UI workflows
- Bridge (เชื่อม) product logic กับ outside systems

### หมายเหตุทางสถาปัตยกรรม
เลเยอร์นี้ควรเข้าใจว่าเป็นส่วนหนึ่งของ production system ไม่ใช่ "extra scripts" มันอาจส่งผลอย่างมีสาระต่อ:
- Product behavior
- Public outputs
- Operational risk
- Debugging complexity

---

## 6. Terminal / Raw SSE Layer (เลเยอร์ Terminal / Raw SSE)

### ประกอบด้วย
- `/api/cli/stream`
- `/api/memory/cli`
- Local CLI shims และ terminal-native consumers

### หน้าที่
- Stream assistant responses เป็น raw SSE
- Emit typed lifecycle deltas สำหรับ text, tool use, completion, และ local execution
- Preserve line-framed chunk semantics ข้าม proxy/CDN hops
- รองรับ CLI orchestration, local approval matrices, และ memory calls โดยไม่มี browser middleware

### ทำไมถึงสำคัญ
เลเยอร์นี้เป็น terminal-native โดย design ไม่สามารถพึ่งพา:
- Browser retry behavior
- ServiceWorker buffering
- Framework fetch wrappers
พึ่งพาแทน:
- Stable chunked transfer semantics
- Explicit event taxonomy
- Client-side timeout และ recovery rules
- Proxy policies ที่ไม่ buffer หรือ rewrite SSE frames

---

## Cross-Cutting Architecture Themes (ธีมสถาปัตยกรรมข้าม)

## A. Workspace-First Model (โมเดล Workspace-First)

Product shift หลักใน codebase คือการทำให้ **workspace** เป็น primary runtime container แทนที่จะถือ chat เป็น generic standalone surface

### ทำไมถึงสำคัญ
Workspaces ตั้งใจจะกำหนดรูปแบบ:
- Context scope
- Memory behavior
- Runtime selection
- User organization
- Future personalization และ system composition

---

## B. Operating-Profile-Driven Runtime Behavior (พฤติกรรม Runtime ที่ขับเคลื่อนด้วย Operating Profile)

System direction รวมถึงการย้าย behavior selection ไปเป็น model ที่ **operating profiles** ส่งผลต่อ runtime characteristics

### ทำไมถึงสำคัญ
สิ่งนี้ช่วยให้ระบบรองรับ:
- Behavior/cost tradeoffs ที่ต่างกัน
- Honest runtime control มากขึ้น
- Future profile-aware AI behavior

นี่เป็นหนึ่งใน architectural differentiators (ตัวแยกสถาปัตยกรรม) ที่สำคัญที่สุดใน codebase

---

## C. Prepared Context over Naive Raw History (Context ที่เตรียมไว้ มากกว่า Raw History แบบ Naive)

ระบบกำลังเคลื่อนไปสู่ prepared-context model แทนที่จะพึ่งพาแค่ unstructured rolling message history

### ทำไมถึงสำคัญ
Prepared context ช่วยให้:
- Prompt structure ชัดเจนขึ้น
- Memory boundaries ดียิ่งขึ้น
- Retrieval/context composition  eksplict (ชัดเจน) ขึ้น
- Safer future graph/retrieval augmentation

---

## D. Public / Protected Boundary Discipline (วินัยขอบเขต Public / Protected)

เนื่องจากผลิตภัณฑ์ผสม public pages, authenticated pages, APIs, และ callbacks boundary discipline จึงสำคัญมาก

### Common Failure Mode (โหมดล้มเหลวทั่วไป)
Public UI route อาจ link เข้า protected surface โดยไม่ได้ตั้งใจ สร้าง sign-in wall หรือ unexpected auth bounce

นี่คือเหตุผลที่ route visibility ต้อง documented และ reviewed อย่างระมัดระวัง

---

## Request Flow (High-Level) (กระแสคำขอ ระดับสูง)

## Public Page Flow
1. User ขอ public page
2. Middleware/proxy กำหนด route เป็น public
3. Locale handling ถูก apply
4. Public content ถูก render โดยไม่มี auth requirement

## Authenticated Product Flow
1. User ขอ authenticated route
2. Middleware/proxy ตรวจสอบ auth
3. User identity ถูก resolve
4. Localized app shell โหลด
5. Page-specific data และ runtime behavior โหลด ตาม user/application context

## Chat / Runtime Flow (Simplified)
1. Frontend ส่ง request ไป API layer
2. Server resolve conversation/workspace/profile context
3. Prepared context ถูก assemble
4. Runtime mode/model behavior ถูกเลือก server-side
5. Model/provider path execute
6. Response ส่งคืนพร้อม optional debug visibility ขึ้นกับ implementation

## Automation / Cron Flow
1. Scheduled หรือ external trigger หยุดที่ API route
2. Route execute server-side task logic
3. State อ่าน/เขียนผ่าน persistence layer
4. Integration/public side effects อาจถูกผลิต ขึ้นกับ job

---

## Trust Boundaries (ขอบเขตความไว้วางใจ)

Architecture มี trust boundaries สำคัญหลายประการ:

### Public Visitors (ผู้เยี่ยมชมสาธารณะ)
- เข้าถึง public informational surfaces ได้
- ควรไม่สามารถ mutate protected product state ได้

### Authenticated Users (ผู้ใช้ที่ยืนยันตัวตนแล้ว)
- เข้าถึง product surfaces ที่เหมาะกับ identity และ configuration ได้

### Backend/Internal Jobs
- Execute privileged logic ที่ไม่พร้อมให้ public clients ได้

### External Platforms (แพลตฟอร์มภายนอก)
- เรียก designated callback/webhook endpoints ได้เฉพาะผ่าน explicit allowed surfaces

Trust boundary confusion เป็นหนึ่งในวิธีที่ง่ายที่สุดที่ทำให้ระบบแบบนี้ fragile (เปราะบาง)

---

## Operational Realities (ความเป็นจริงทางปฏิบัติการ)

Codebase ได้ surfaced (นำขึ้นมา) operational realities สำคัญหลายอย่าง:
- Cloud build truth อาจน่าเชื่อถือกว่า local build truth
- Deployment action logs อาจ noisy (มีสัญญาณรบกวน) หรือ lossy (สูญเสียข้อมูล)
- Route gating issues อาจสร้าง production bugs ได้เร็ว
- Architecture changes ต้องมี documentation ควบคู่ implementation เพื่อให้ legible (อ่านเข้าใจได้)

Realities นี้ควรถือเป็นส่วนหนึ่งของ architecture ไม่ใช่แยกออกไป

---

## What This Architecture Is Becoming (สถาปัตยกรรมนี้กำลังจะเป็นอะไร)

Genie AI กำลังกลายเป็น:

> workspace-centric, operating-profile-aware, memory-native AI platform with public discovery surfaces, authenticated execution surfaces, และ backend automation/integration layers.

คำอธิบายนี้แม่นยำกว่า label เรียบง่ายอย่าง "chatbot app"

---

## Recommended Next Architecture Docs (เอกสารสถาปัตยกรรมถัดไปที่แนะนำ)

Backbone doc นี้ควรตามด้วย architecture documents ที่เฉพาะเจาะจงมากขึ้นสำหรับ:
- Runtime mode routing
- Memory and context architecture
- Public route boundaries
- Truth surfaces และ deployment verification
- API reference behavior