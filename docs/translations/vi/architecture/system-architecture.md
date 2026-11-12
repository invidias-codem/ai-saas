# Kiến Trúc Hệ Thống

Lattice OS là một nền tảng AI tập trung vào workspace (không gian làm việc), nhận biết operating profile (hồ sơ vận hành) và native về memory (bộ nhớ). Triển khai được tổ chức dưới dạng monorepo được quản lý bởi pnpm, tách biệt logic độc lập với nền tảng (platform-agnostic) khỏi các adapter (bộ chuyển đổi) dành riêng cho việc phân phối (delivery-specific).

## Bố Cục Monorepo

| Gói (Package) | Vai Trò |
|---------|------|
| `apps/web` | Frontend Next.js 14+ (app router, Clerk auth, UI) |
| `packages/lattice-core` | Contracts (hợp đồng) được xác thực bằng Zod, constants (hằng số), schemas (lược đồ) license/preflight |
| `packages/lattice-mcp-local` | Local MCP stdio adapter |
| `packages/lattice-mcp-remote` | Remote MCP HTTP adapter (xác thực bằng Clerk) |
| `packages/lattice-ai-skills` | AI Skills adapter: SKILL.md schema, slash commands, wrappers, Custom GPT manifest |

Ứng dụng Next.js gốc (root) phụ thuộc vào các gói workspace ở phiên bản `workspace:*` và build chúng trong bước `prebuild`.

## Ánh Xạ Các Lớp (Layer Mapping)

| Lớp Kiến Trúc | Triển Khai |
|---------------------|----------------|
| Public web surface (Bề mặt web công khai) | `app/(landing)/*` và `app/(public)/beta/*` |
| Authenticated surface (Bề mặt đã xác thực) | `app/(dashboard)/*` với Clerk middleware |
| API/server behavior (Hành vi API/máy chủ) | Route handlers `app/api/**/*` |
| Persistence (Sự bền bỉ) | Supabase + PostgreSQL (chỉ phía server) |
| Automation/integration (Tự động hóa/tích hợp) | Cron jobs, webhook routes, MCP adapters |
| Terminal / Raw SSE | `/api/cli/stream`, `/api/memory/cli`, local CLI shim path |

## Build & Deploy (Xây dựng & Triển khai)

- Thứ tự build: `prebuild` chạy `pnpm --dir packages/lattice-{core,mcp-local,mcp-remote,ai-skills} run build` trước để `dist/` tồn tại trước khi bundling Next.js.
- Vercel: `.vercelignore` cho phép `packages/lattice-*` (chỉ `packages/ucol-node/` bị loại trừ). Sửa lỗi prebuild và NFT-scoped dynamic require nằm trong `package.json` và `next.config.mjs`.

---
...
Tài liệu này cung cấp giải thích cấp cao về kiến trúc hệ thống hiện tại của Lattice OS.

Nó nhằm mục đích trả lời:
- các lớp hệ thống chính là gì
- các request (yêu cầu) di chuyển qua hệ thống như thế nào
- state (trạng thái) nằm ở đâu
- các bề mặt công khai, đã xác thực và tự động hóa backend khác nhau như thế nào
- các chủ đề kiến trúc nào là trung tâm cho hướng phát triển sản phẩm

Tài liệu này là tổng quan kiến trúc backbone (xương sống), không phải spec (đặc tả) đầy đủ của các subsystem (hệ thống con).

---

## Tổng Quan Cấp Cao (High-Level View)

Ở mức độ rộng, Lattice OS bao gồm sáu lớp kiến trúc chính:

1. **Public web surface (Bề mặt web công khai)**
2. **Authenticated application surface (Bề mặt ứng dụng đã xác thực)**
3. **API and server behavior layer (Lớp hành vi API và máy chủ)**
4. **Data / Persistence layer (Lớp dữ liệu / sự bền bỉ)**
5. **Automation / Integration layer (Lớp tự động hóa / tích hợp)**
6. **Terminal / Raw SSE layer (Lớp Terminal / Raw SSE)**

Các lớp này được kết nối, nhưng phục vụ đối tượng khác nhau và có các trust boundaries (ranh giới niềm tin) khác nhau.

---

## 1. Public Web Surface (Bề Mặt Web Công Khai)

### Bao Gồm
- landing pages (trang đích)
- public informational pages (trang thông tin công khai)
- blog/docs/support/privacy pages
- các bề mặt marketing hoặc informational khác không cần xác thực

### Trách Nhiệm
- giải thích sản phẩm
- hỗ trợ discovery (khám phá)
- cung cấp điểm truy cập tài liệu và hỗ trợ công khai
- điều hướng người dùng vào sign-up (đăng ký) hoặc product surfaces (bề mặt sản phẩm) khi phù hợp

### Ghi Chú Kiến Trúc
- các routes này nên vẫn accessible (có thể truy cập) công khai
- chúng không nên vô tình inherit (kế thừa) các assumptions (giả định) của authenticated dashboard
- route gating bugs (lỗi gating tuyến đường) ở layer này tạo ra user-facing trust issues (vấn đề niềm tin mặt người dùng) nhanh chóng

---

## 2. Authenticated Application Surface (Bề Mặt Ứng Dụng Đã Xác Thực)

### Bao Gồm
- dashboard
- conversations (cuộc hội thoại)
- workspaces (không gian làm việc)
- onboarding
- settings (cài đặt)
- các user-specific application flows (luồng ứng dụng đặc thù cho người dùng) khác

### Trách Nhiệm
- hold (giữ) user-specific product state (trạng thái sản phẩm đặc thù người dùng)
- drive (điều khiển) actual AI interaction workflows (các quy trình tương tác AI thực tế)
- expose (phơi bày) workspace-aware và profile-aware behavior (hành vi nhận biết workspace/hồ sơ)
- cung cấp product functionality (chức năng sản phẩm) thay vì chỉ marketing/informational content

### Ghi Chú Kiến Trúc
- layer này depends on (phụ thuộc vào) authenticated identity (danh tính đã xác thực)
- nó càng ngày càng depends on workspace và operating-profile context
- nó không nên được xem như cùng một hệ thống với landing surface mà chỉ thêm auth lên trên

---

## 3. API and Server Behavior Layer (Lớp Hành Vi API Và Máy Chủ)

### Bao Gồm
- route handlers (trình xử lý tuyến đường) dưới `app/api/...`
- server-side runtime selection logic (logic chọn runtime phía máy chủ)
- conversation orchestration logic (logic điều phối hội thoại)
- integration callbacks và cron endpoints

### Trách Nhiệm
- process (xử lý) chat và application actions
- resolve (giải quyết) server-side behavior
- cung cấp structured interfaces (giao diện có cấu trúc) giữa UI và backend logic
- enforce (thi hành) protected/public API boundaries (ranh giới)
- support (hỗ trợ) scheduled và external workflows

### Important Architectural Direction (Hướng Kiến Trúc Quan Trọng)
Một hướng quan trọng trong hệ thống là di chuyển nhiều behavioral truth (sự thật hành vi) hơn vào server layer, đặc biệt xung quanh:
- runtime mode selection (chọn chế độ runtime)
- workspace-aware behavior
- operating-profile-aware decision making (ra quyết định nhận biết hồ sơ vận hành)

Điều này giảm misleading client-side state (trạng thái phía client gây hiểu lầm) và làm cho behavior (hành vi) inspectable (có thể kiểm tra) hơn.

---

## 4. Data / Persistence Layer (Lớp Dữ Liệu / Sự Bền Bỉ)

### Bao Gồm
- Supabase / PostgreSQL-backed structured data (dữ liệu có cấu trúc được hỗ trợ bởi Supabase/PostgreSQL)
- relational application state (trạng thái ứng dụng quan hệ)
- emerging memory/retrieval-related state và supporting persistence (trạng thái mới nổi liên quan đến memory/retrieval và sự bền bỉ hỗ trợ)

### Trách Nhiệm
- persist (làm bền bỉ) user/application data
- support (hỗ trợ) workspace và profile models
- back (hỗ trợ) conversations và các product structures khác
- support scheduled/integration workflows cần durable state (trạng thái bền vững)

### Architectural Note (Ghi Chú Kiến Trúc)
Persistence layer không chỉ là một passive storage bucket (xô lưu trữ thụ động). Nó ngày càng hỗ trợ các architectural transitions (chuyển tiếp kiến trúc) trong sản phẩm, đặc biệt xung quanh:
- workspace-first behavior
- profile-derived runtime decisions (quyết định runtime xuất phát từ profile)
- memory/context system evolution (tiến hóa hệ thống memory/context)

---

## 5. Automation / Integration Layer (Lớp Tự Động Hóa / Tích Hợp)

### Bao Gồm
- cron-triggered routes (các route được kích hoạt bởi cron)
- webhook endpoints
- integration callbacks
- social/distribution automation
- external messaging/integration flows

### Trách Nhiệm
- coordinate (điều phối) scheduled tasks (nhiệm vụ theo lịch)
- handle (xử lý) external platform events
- maintain (duy trì) non-UI workflows
- bridge (cầu nối) product logic với outside systems (hệ thống bên ngoài)

### Architectural Note
Layer này nên được hiểu là một phần của production system (hệ thống sản xuất), không phải "extra scripts" (scripts thừa). Nó có thể materially affect (tác động thực tế) đến:
- product behavior
- public outputs
- operational risk (rủi ro vận hành)
- debugging complexity (độ phức tạp gỡ lỗi)

---

## 6. Terminal / Raw SSE Layer (Lớp Terminal / Raw SSE)

### Bao Gồm
- `/api/cli/stream`
- `/api/memory/cli`
- local CLI shims và terminal-native consumers (người tiêu dùng bản địa terminal)

### Trách Nhiệm
- stream (luôn truyền) assistant responses (phản hồi trợ lý) dưới dạng raw SSE
- emit (phát ra) typed lifecycle deltas (sự thay đổi vòng đời có kiểu) cho text, tool use (sử dụng công cụ), completion (hoàn thành), và local execution (thực thi cục bộ)
- preserve (bảo toàn) line-framed chunk semantics (ngữ nghĩa chunk được khung bằng dòng) qua các proxy/CDN hops
- support CLI orchestration, local approval matrices (ma trận phê duyệt cục bộ), và memory calls (gọi bộ nhớ) mà không có browser middleware

### Why This Matters (Tại Sao Điều Này Quan Trọng)
Layer này là terminal-native by design (thiết kế bản chất terminal). Nó không thể rely on (phụ thuộc vào):
- browser retry behavior (hành vi thử lại trình duyệt)
- ServiceWorker buffering
- framework fetch wrappers
Nó depends on (phụ thuộc vào):
- stable chunked transfer semantics (ngữ nghĩa truyền tải chunked ổn định)
- explicit event taxonomy (phân loại sự kiện rõ ràng)
- client-side timeout và recovery rules (quy tắc timeout và khôi phục phía client)
- proxy policies (chính sách proxy) không buffer hoặc rewrite (viết lại) SSE frames

---

## Cross-Cutting Architecture Themes (Chủ Đề Kiến Trúc Chéo)

## A. Workspace-First Model (Mô Hình Workspace-First)

Một product shift (chuyển dịch sản phẩm) lớn trong codebase là làm cho **workspace** trở thành primary runtime container (container runtime chính) thay vì đối xử chat như một generic standalone surface (bề mặt độc lập chung chung).

### Why It Matters (Tại Sao Quan Trọng)
Workspaces nhằm mục đích hình thành:
- context scope (phạm vi ngữ cảnh)
- memory behavior
- runtime selection
- user organization
- future personalization (cá nhân hóa) và system composition (tổ hợp hệ thống)

---

## B. Operating-Profile-Driven Runtime Behavior (Hành Vi Runtime Được Điều Khiển Bởi Operating Profile)

Hướng của hệ thống bao gồm việc di chuyển behavior selection (lựa chọn hành vi) vào một model (mô hình) nơi **operating profiles** ảnh hưởng đến runtime characteristics (đặc điểm runtime).

### Why It Matters
Điều này cho phép hệ thống support (hỗ trợ):
- các behavior/cost tradeoffs (sự đánh đổi hành vi/chi phí) khác nhau
- honest runtime control (kiểm soát runtime trung thực) hơn
- future profile-aware AI behavior (hành vi AI nhận biết profile trong tương lai)

Đây là một trong những architectural differentiators (điểm khác biệt kiến trúc) quan trọng nhất trong codebase.

---

## C. Prepared Context over Naive Raw History (Ngữ Cảnh Đã Chuẩn Bị Thay Vì Raw History Naive)

Hệ thống đang chuyển về prepared-context model thay vì chỉ dựa vào unstructured rolling message history (lịch sử tin nhắn cuộn không có cấu trúc).

### Why It Matters
Prepared context enables (cho phép):
- clearer prompt structure (cấu trúc prompt rõ ràng hơn)
- better memory boundaries (ranh giới bộ nhớ tốt hơn)
- more explicit retrieval/context composition (tổ hợp retrieval/ngữ cảnh rõ ràng hơn)
- safer future graph/retrieval augmentation (tăng cường graph/retrieval an toàn hơn trong tương lai)

---

## D. Public / Protected Boundary Discipline (Kỷ Luật Ranh Giới Public / Protected)

Vì sản phẩm mix (trộn) public pages, authenticated pages, APIs, và callbacks, boundary discipline (kỷ luật ranh giới) quan trọng rất nhiều.

### Common Failure Mode (Chế Độ Thất Bại Phổ Biến)
Một public UI route có thể link vào một protected surface (bề mặt được bảo vệ) vô tình, tạo ra một sign-in wall (tường đăng nhập) hoặc unexpected auth bounce (chuyển hướng xác thực bất ngờ).

Đây là lý do route visibility (sự hiển thị tuyến đường) phải được documented (tài liệu hóa) và reviewed (xem xét) cẩn thận.

---

## Request Flow (High-Level) (Luồng Yêu Cầu - Cấp Cao)

## Public Page Flow (Luồng Trang Công Khai)
1. user requests public page (người dùng yêu cầu trang công khai)
2. middleware/proxy determines route is public (middleware/proxy xác định route là công khai)
3. locale handling is applied (xử lý locale được áp dụng)
4. public content is rendered without auth requirement (nội dung công khai được render mà không cần yêu cầu auth)

## Authenticated Product Flow (Luồng Sản Phẩm Đã Xác Thực)
1. user requests authenticated route (người dùng yêu cầu route đã xác thực)
2. middleware/proxy checks auth (middleware/proxy kiểm tra auth)
3. user identity is resolved (danh tính người dùng được giải quyết)
4. localized app shell loads (shell ứng dụng bản địa hóa tải)
5. page-specific data và runtime behavior load based on user/application context (dữ liệu đặc thù trang và hành vi runtime tải dựa trên context người dùng/ứng dụng)

## Chat / Runtime Flow (Simplified) (Luồng Chat / Runtime - Đơn Giản Hóa)
1. frontend submits request to API layer (frontend gửi request đến layer API)
2. server resolves conversation/workspace/profile context (máy chủ giải quyết context hội thoại/workspace/profile)
3. prepared context is assembled (ngữ cảnh đã chuẩn bị được lắp ráp)
4. runtime mode/model behavior is selected server-side (chế độ runtime/hành vi mô hình được chọn phía server)
5. model/provider path executes (đường dẫn model/provider thực thi)
6. response is returned with optional debug visibility depending on implementation (phản hồi được trả về với debug visibility tùy chọn tùy thuộc vào triển khai)

## Automation / Cron Flow (Luồng Tự Động Hóa / Cron)
1. scheduled or external trigger hits API route (kích hoạt theo lịch hoặc bên ngoài chạm route API)
2. route executes server-side task logic (route thực thi logic nhiệm vụ phía server)
3. state is read/written through persistence layer (trạng thái được đọc/ghi qua persistence layer)
4. integration/public side effects may be produced depending on the job (hiệu ứng phụ integration/public có thể được tạo ra tùy thuộc vào job)

---

## Trust Boundaries (Ranh Giới Niềm Tin)

Kiến trúc có một số trust boundaries quan trọng:

### Public Visitors (Khách Truy Cập Công Khai)
- can access public informational surfaces (có thể truy cập các bề mặt thông tin công khai)
- should not be able to mutate protected product state (không nên có thể thay đổi trạng thái sản phẩm được bảo vệ)

### Authenticated Users (Người Dùng Đã Xác Thực)
- can access product surfaces appropriate to their identity and configuration (có thể truy cập các bề mặt sản phẩm phù hợp với danh tính và cấu hình của họ)

### Backend/Internal Jobs (Nhiệm Vụ Backend/Nội Bộ)
- can execute privileged logic not available to public clients (có thể thực thi logic đặc quyền không có sẵn cho public clients)

### External Platforms (Nền Tảng Bên Ngoài)
- can call designated callback/webhook endpoints only through explicit allowed surfaces (chỉ có thể gọi các callback/webhook endpoints được chỉ định qua các surfaces được phép rõ ràng)

Trust boundary confusion (nhầm lẫn ranh giới niềm tin) là một trong những cách dễ dàng nhất để loại hệ thống này trở nên fragile (mong manh).

---

## Operational Realities (Thực Tế Vận Hành)

Codebase đã surfaced (nêu bật) một vài operational realities quan trọng:
- cloud build truth (sự thật build trên cloud) có thể reliable (đáng tin cậy) hơn local build truth
- deployment action logs (logs hành động triển khai) có thể noisy (nhiễu) hoặc lossy (mất mát)
- route gating issues (vấn đề gating tuyến đường) có thể sản xuất production bugs (lỗi sản xuất) nhanh chóng
- architecture changes (thay đổi kiến trúc) cần documentation (tài liệu) alongside implementation (cùng với triển khai) để stay legible (vẫn dễ đọc/hiểu)

Các realities này nên được treat as (xem như) một phần của architecture, không separate from it (tách biệt khỏi nó).

---

## What This Architecture Is Becoming (Kiến Trúc Này Đang Trở Thành Cái Gì)

Genie AI đang ngày càng trở thành:

> một workspace-centric, operating-profile-aware, memory-native AI platform with public discovery surfaces, authenticated execution surfaces, và backend automation/integration layers.

Mô tả này accurate (chính xác) hơn một label (nhãn) đơn giản hơn là "chatbot app".

---

## Recommended Next Architecture Docs (Các Tài Liệu Kiến Trúc Tiếp Theo Được Khuyến Nghị)

Backbone doc này nên được followed by (theo sau bởi) các architecture documents cụ thể hơn cho:
- runtime mode routing
- memory and context architecture
- public route boundaries
- truth surfaces and deployment verification
- API reference behavior