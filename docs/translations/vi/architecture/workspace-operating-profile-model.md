# Mô Hình Workspace Và Operating Profile (Workspace and Operating Profile Model)

## Mục Đích

Tài liệu này giải thích mối quan hệ (relationship) giữa **workspaces** và **operating profiles** trong Genie AI.

Nó tồn tại vì model (mô hình) này là một trong những shifts (chuyển dịch) quan trọng nhất trong architecture (kiến trúc) và product identity (bản sắc sản phẩm) của platform (nền tảng).

Genie AI đang evolving (tiến hóa) away from (xa rời) một simpler "chat plus tool pages" pattern (mẫu đơn giản hơn) toward (đến) một more structured system (hệ thống có cấu trúc hơn) nơi:
- workspace là primary organizational container (container tổ chức chính)
- operating profile shapes (hình thành) runtime behavior
- conversations increasingly inherits (ngày càng kế thừa) context từ that structure (cấu trúc đó)

Tài liệu này clarifies (làm rõ) model đó at a conceptual and architectural level (ở cấp độ khái niệm và kiến trúc).

---

## Nguyên Tắc Cốt Lõi (Core Principle)

Platform (nền tảng) should not treat (không nên đối xử) every conversation as a contextless generic chat thread (luồng chat chung chung không có ngữ cảnh).

Instead (Thay vào đó):
- **workspace** provides the container (cung cấp container/khung chứa)
- **operating profile** provides behavioral shape (cung cấp hình dạng hành vi)
- **conversation** becomes an active thread inside that structure (trở thành một active thread bên trong cấu trúc đó)

Đây là backbone (xương sống) của một more memory-native, cost-aware, and context-aware product (sản phẩm nhận biết bộ nhớ, chi phí, và ngữ cảnh hơn).

---

## Tại Sao Model Này Tồn Tại (Why This Model Exists)

Một generic chatbot model (mô hình chatbot chung chung) tends to flatten (xu hướng làm phẳng) everything into one surface (mọi thứ thành một bề mặt):
- same context assumptions (cùng các giả định ngữ cảnh)
- same runtime assumptions (cùng các giả định runtime)
- same cost/quality assumptions (cùng các giả định chi phí/chất lượng)
- weak organizational boundaries (ranh giới tổ chức yếu)

That approach breaks down (Cách tiếp cận đó bị vỡ) when the platform wants to support (khi nền tảng muốn hỗ trợ):
- differentiated runtime behavior (hành vi runtime được phân biệt)
- stronger context preparation (chuẩn bị ngữ cảnh mạnh mẽ hơn)
- meaningful user organization (tổ chức người dùng có ý nghĩa)
- future memory boundaries (ranh giới bộ nhớ tương lai)
- budget-conscious product strategy (chiến lược sản phẩm nhận biết ngân sách)

The workspace + operating-profile model is intended to solve that (Model workspace + operating-profile nhằm giải quyết điều đó).

---

## Primary Objects (Các Đối Tượng Chính)

## 1. Workspace

### What it is (Nó là gì)
A workspace is the primary container for a meaningful unit of user activity (Một workspace là container chính cho một đơn vị hoạt động người dùng có ý nghĩa).

### What it represents (Nó đại diện cho gì)
A workspace can represent (Một workspace có thể đại diện):
- a project (một dự án)
- a domain of work (một lĩnh vực công việc)
- a persistent context container (một container ngữ cảnh bền vững)
- a future memory boundary (một ranh giới bộ nhớ tương lai)
- a runtime-scoping unit (một đơn vị phạm vi runtime)

### Why it matters (Tại sao nó quan trọng)
A workspace gives the platform a place to attach (Một workspace cho nền tảng một nơi để attach/gắn):
- conversations (cuộc hội thoại)
- memory/context behavior (hành vi memory/context)
- future knowledge structures (cấu trúc kiến thức tương lai)
- profile-shaped runtime assumptions (các giả định runtime được hình thành bởi profile)

Without a real workspace model (Nếu không có một workspace model thật), context and behavior stay too flat (ngữ cảnh và hành vi vẫn quá phẳng).

---

## 2. Operating Profile

### What it is
An operating profile is a structured description (mô tả có cấu trúc) of how the system should behave for a given user/workspace context (cho một ngữ cảnh user/workspace cho trước).

### What it influences (Nó ảnh hưởng đến gì)
An operating profile can shape (Một operating profile có thể hình thành):
- runtime mode selection (lựa chọn chế độ runtime)
- cost/latency/quality tradeoffs (sự đánh đổi chi phí/độ trễ/chất lượng)
- future context-selection policies (chính sách lựa chọn ngữ cảnh tương lai)
- style and system behavior expectations (phong cách và kỳ vọng hành vi hệ thống)
- how the platform balances capability with efficiency (nền tảng cân bằng capability với efficiency như thế nào)

### Why it matters (Tại sao nó quan trọng)
An operating profile is more honest and extensible (trung thực và có thể mở rộng hơn) than exposing a simplistic "fast / quality / agentic" mode toggle without enough backend context to support it properly (bật/tắt chế độ đơn giản "nhanh/chất lượng/agentic" nếu không có đủ backend context để support nó đúng cách).

---

## 3. Conversation (Cuộc Hội Thoại)

### What it is
A conversation is the active interaction thread (luồng tương tác hoạt động) inside the workspace/profile model.

### Why it matters
A conversation should no longer be treated as a free-floating isolated object by default (Một cuộc hội thoại không còn nên được đối xử như một đối tượng cô lập nổi tự do theo mặc định).

Instead (Thay vào đó), a conversation increasingly derives meaning from (ngày càng xuất phát ý nghĩa từ):
- its workspace membership (sự thành viên workspace của nó)
- its profile-linked runtime behavior (hành vi runtime liên kết profile của nó)
- future memory/context layers attached to that structure (các lớp memory/context tương lai gắn vào cấu trúc đó)

---

## Relationship Between the Three (Mối Quan Hệ Giữa Ba Đối Tượng)

At a conceptual level (Ở cấp độ khái niệm):
- **workspace** = where the work lives (nơi công việc sống/sống)
- **operating profile** = how the system should behave in that environment (hệ thống nên behave như thế nào trong môi trường đó)
- **conversation** = the active thread happening within that structure (luồng hoạt động đang xảy ra bên trong cấu trúc đó)

Relationship này là one of the most important product abstractions (một trong những trừu tượng sản phẩm quan trọng nhất) in Genie AI.

---

## Workspace as Primary Container (Workspace Là Container Chính)

The platform direction increasingly treats workspace as the main runtime container (Hướng nền tảng ngày càng đối xử workspace như container runtime chính).

### Why this is important (Tại sao điều này quan trọng)
A workspace can anchor (Một workspace có thể neo/neo đơn):
- organizational identity (danh tính tổ chức)
- memory scope (phạm vi bộ nhớ)
- future retrieval scope (phạm vi truy xuất tương lai)
- runtime policy (chính sách runtime)
- conversation grouping (nhóm hội thoại)

### Architectural implication (Hàm ý kiến trúc)
This means workspace is not just a sidebar label or cosmetic folder (Điều này nghĩa workspace không chỉ là sidebar label hay cosmetic folder).
It is intended to become part of the real runtime model (Nó intended to become một phần của real runtime model).

---

## Operating Profile as Runtime Policy Layer (Operating Profile Là Lớp Chính Sách Runtime)

An operating profile should be understood as a policy layer (Một operating profile nên được hiểu như một policy layer) rather than just a preference label (thay vì chỉ là một preference label).

### It can eventually express things like (Nó cuối cùng có thể biểu đạt những thứ như)
- whether behavior should optimize more for speed or depth (hành vi có nên optimize hơn cho speed hay depth)
- whether certain workflow patterns are expected (có workflow patterns nào được expected không)
- what kind of context assembly is appropriate (loại context assembly nào là appropriate)
- how to trade off capability, cost, and latency in a more structured way (cách trade off capability, cost, và latency theo cách có cấu trúc hơn)

### Why this matters (Tại sao điều này quan trọng)
This creates differentiation (Tạo ra sự khác biệt) without pretending there is one universally optimal expensive mode for every conversation (mà không pretending có one universally optimal expensive mode cho mọi conversation).

It also aligns with the broader product direction of being more budget-aware and profile-shaped rather than "one premium mode for everything" (Nó cũng align với broader product direction của việc more budget-aware và profile-shaped thay vì "one premium mode for everything").

---

## Why This Is Better Than Generic Chat Modes (Tại Sao Điều Này Tốt Hơn Generic Chat Modes)

A simple client-side mode switch is easy to expose (Một simple client-side mode switch dễ dàng expose), but weak architecturally (nhưng yếu về mặt kiến trúc).

### Problems with naive chat modes (Vấn đề với naive chat modes)
- they can misrepresent what the backend actually does (chúng có thể misrepresent cái backend actually does)
- they ignore workspace context (chúng ignore workspace context)
- they do not scale well into memory-aware behavior (chúng không scale tốt vào memory-aware behavior)
- they often create fake precision in the UI (chúng thường tạo fake precision trong UI)

### Advantages of workspace + operating profile (Lợi thế của workspace + operating profile)
- behavior can be derived from richer context (hành vi có thể derived từ richer context)
- runtime routing becomes more honest (runtime routing trở nên honest hơn)
- product behavior becomes more composable (product behavior trở nên composable hơn)
- future memory/retrieval layers have a stable container model (future memory/retrieval layers có stable container model)

---

## Relationship to Runtime Mode Routing (Mối Quan Hệ Với Điều Hướng Chế Độ Runtime)

The workspace/operating-profile model is one of the main reasons (một trong những lý do chính) runtime mode routing moved toward server-side resolution (chuyển sang server-side resolution).

### Why (Tại Sao)
The backend needs to inspect (Backend cần inspect/kiểm tra):
- what conversation this is (conversation này là gì)
- which workspace it belongs to (nó thuộc workspace nào)
- whether a profile should shape behavior (profile có nên shape behavior không)

This is stronger than asking the client to guess the final mode manually (Điều này mạnh hơn là asking client to guess final mode manually).

---

## Relationship to Memory and Context Architecture (Mối Quan Hệ Với Kiến Trúc Memory và Context)

The workspace/operating-profile model also matters (cũng quan trọng) because memory and context preparation need boundaries (vì memory và context preparation cần boundaries/ranh giới).

### Workspace can provide (Workspace có thể cung cấp)
- context scope (phạm vi ngữ cảnh)
- memory container identity (danh tính container bộ nhớ)
- future retrieval boundary (ranh giới retrieval tương lai)

### Operating profile can provide (Operating profile có thể cung cấp)
- context-selection policy hints (gợi ý chính sách lựa chọn ngữ cảnh)
- expected behavior shape (hình dạng hành vi kỳ vọng)
- future memory/runtime balancing rules (cân bằng quy tắc memory/runtime tương lai)

This is why these systems should be understood together, not independently (Đây là lý do các systems này nên được hiểu together, không independently).

---

## General / Pre-Workspace Flows (Luồng Chung / Trước Workspace)

The platform still needs to support users before full workspace anchoring is established (Nền tảng vẫn cần support users trước khi full workspace anchoring được established/thiết lập).

### Current design implication (Nัย thiết kế hiện tại)
Pre-workspace or lightly-scoped chat is intentionally simplified and more honest (Pre-workspace or lightly-scoped chat được intentionally simplified và more honest).

### Example (Ví Dụ)
The move toward a single **General** pre-workspace mode reflects this (Việc chuyển sang single **General** pre-workspace mode phản ánh điều này).

### Why (Tại Sao)
It avoids pretending that the platform already has the rich workspace/profile context needed to justify deeper backend behavioral differentiation (Nó avoids pretending platform already has rich workspace/profile context needed to justify deeper backend behavioral differentiation).

---

## Onboarding Implications (Nัย Onboarding)

A meaningful onboarding flow should not only create a user account (Một meaningful onboarding flow không chỉ nên create a user account).
It should help instantiate the actual runtime structure of the platform (Nó nên giúp instantiate cấu trúc runtime thực tế của platform).

### In practical terms, onboarding should move toward creating (Về mặt thực tế, onboarding nên chuyển hướng tạo ra):
- a personalized operating profile (một operating profile được cá nhân hóa)
- a starter workspace (một workspace khởi đầu)
- a starter conversation/path into that workspace (một conversation/path khởi đầu vào workspace đó)

### Why this matters (Tại sao điều này quan trọng)
This makes onboarding part of the architecture, not just account setup (Điều này makes onboarding part of the architecture, not just account setup).

---

## Cost and Product Strategy Implications (Nัย Chi Phí Và Chiến Lược Sản Phẩm)

This model also supports an important product strategy idea (Model này cũng support một important product strategy idea quan trọng):

### Instead of (Thay vì)
one default expensive "best" mode for everyone (một default expensive "best" mode cho everyone),

### the platform can aim for (nền tảng có thể aim for/mục tiêu)
profile-shaped runtime economics and behavior (kinh tế runtime và hành vi profile-shaped).

That allows the product to pursue (Điều đó allows the product to pursue/cho phép sản phẩm theo đuổi):
- stronger alignment between user needs and system behavior (alignment mạnh hơn giữa user needs và system behavior)
- better cost discipline (kỷ luật chi phí tốt hơn)
- more meaningful differentiation at a lower price point (sự khác biệt có ý nghĩa hơn ở price point thấp hơn)

This is a serious product advantage if implemented honestly (Đây là một serious product advantage nếu implemented honestly).

---

## Common Failure Modes (Các Chế Độ Thất Bại Phổ Biến)

## 1. Workspace as Cosmetic Shell (Workspace Là Vỏ Cosmetic)
A workspace exists in the UI but does not actually influence runtime/context behavior (Một workspace tồn tại trong UI nhưng không actually influence runtime/context behavior).

## 2. Operating Profile as Empty Label (Operating Profile Là Nhãn Rỗng)
A profile exists in the DB/UI but does not shape real backend behavior (Một profile tồn tại trong DB/UI nhưng không shape real backend behavior).

## 3. Conversation Re-Centralization (Conversation Re-Centralization / Tập Trung Lại Conversation)
The system keeps falling back to treating conversations as the real primary object, undermining the workspace model (Hệ thống keep falling back to treating conversations as the real primary object, undermining workspace model).

## 4. UI Promises Ahead of Backend Reality (UI Promises Trước Backend Reality)
The frontend exposes profile/mode controls that the backend cannot yet honor faithfully (Frontend exposes profile/mode controls mà backend cannot yet honor faithfully).

## 5. Onboarding Without Runtime Structure (Onboarding Không Có Runtime Structure)
Users appear "set up" but do not actually have the workspace/profile state needed for the intended architecture (Users appear "set up" nhưng do not actually have workspace/profile state needed for the intended architecture).

---

## Honest Product Framing (Khung Sản Phẩm Trung Thực / Honest Product Framing)

The workspace/operating-profile model should be described plainly (Model workspace/operating-profile nên được described plainly/mô tả rõ ràng).

### Good framing (Khung tốt)
- workspaces organize active context and future memory scope (workspaces organize active context và future memory scope)
- operating profiles help shape backend behavior (operating profiles help shape backend behavior)
- conversations live inside that structure (conversations live inside that structure)
- runtime behavior is increasingly resolved from this model server-side (runtime behavior increasingly resolved from this model server-side)

### Bad framing (Khung xấu)
- "the AI automatically becomes whatever you want everywhere instantly" ("AI tự động trở thành bất cứ gì bạn muốn ở mọi nơi instantly")
- "profiles guarantee perfect intelligence mode selection" ("profiles guarantee perfect intelligence mode selection")
- "workspace means folder, but also everything else somehow" ("workspace means folder, but also everything else somehow")

Precision builds trust (Độ chính xác xây dựng niềm tin).

---

## Forward Direction (Hướng Tiến Tới)

This model becomes more valuable as the rest of the platform matures (Model này becomes more valuable khi rest of the platform matures):
- server-side runtime routing
- prepared context pipelines
- memory-native behavior
- graph/retrieval augmentation
- workspace-scoped persistence and knowledge behavior

The more those systems become real, the more important the workspace/operating-profile abstraction becomes (Càng những systems đó become real, càng workspace/operating-profile abstraction trở nên important).

---

## Summary (Tóm Tắt)

The key idea is this (Ý tưởng chính là này):

**Workspace defines where the work lives. Operating profile helps define how the system should behave there. Conversation is the active thread inside that structure.**

Đó là one of the central architectural ideas (một trong những ý tưởng kiến trúc cốt lõi) in Genie AI's evolution beyond a generic chatbot product.

---

## Related Docs (Các Tài Liệu Liên Quan)

This document should be read alongside (Tài liệu này nên được đọc cùng với):
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- `docs/architecture/memory-and-context-architecture.md`
- future onboarding, API, and ADR documentation