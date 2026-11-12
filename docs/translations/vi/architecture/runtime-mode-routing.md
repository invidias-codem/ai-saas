# Điều Hướng Chế Độ Runtime (Runtime Mode Routing)

## Mục Đích

Tài liệu này giải thích Genie AI xác định hành vi runtime cho các yêu cầu hội thoại (conversation requests) như thế nào.

Nó tồn tại vì nền tảng đang chuyển từ một mô hình toggle chế độ đơn giản được kiểm soát bởi client sang một mô hình routing (định tuyến) được giải quyết bởi server (máy chủ) trung thực hơn, dựa trên ngữ cảnh ứng dụng (application context).

Mục tiêu của tài liệu này là làm rõ:
- nơi chế độ runtime được quyết định
- ngữ cảnh nào ảnh hưởng đến quyết định đó
- các cuộc hội thoại pre-workspace và workspace-backed khác nhau như thế nào
- cách suy luận (reasoning) về debugging (gỡ lỗi) và mở rộng trong tương lai

---

## Nguyên Tắc Cốt Lõi (Core Principle)

Chế độ runtime nên được resolved (giải quyết) bởi server, không được trusted (tin cậy) trực tiếp từ arbitrary client intent (ý định tùy ý của client).

Về mặt thực tế, điều này nghĩa là hệ thống nên ngày càng derive (xuất phát/tự suy ra) runtime behavior từ:
- conversation context (ngữ cảnh hội thoại)
- workspace context (ngữ cảnh không gian làm việc)
- operating profile context (ngữ cảnh hồ sơ vận hành)
- backend routing logic (logic định tuyến backend)

thay vì từ một frontend control (điều khiển giao diện) tuyên bố set (thiết lập) final mode (chế độ cuối cùng) trực tiếp.

---

## Tại Sao Tài Liệu Này Tồn Tại (Why This Exists)

Product behavior (hành vi sản phẩm) trước đây có thể tạo ra mismatch (sự không khớp) giữa:
- những gì UI claimed (khẳng định) rằng mode là gì
- những gì backend actually did (thực sự làm)
- những gì user should reasonably expect (người dùng nên hợp lý kỳ vọng)

Điều này đặc biệt problematic (vấn đề) trong một hệ thống muốn support (hỗ trợ):
- budget-aware behavior (hành vi nhận biết ngân sách)
- workspace-aware behavior
- profile-aware behavior
- future memory-native execution patterns (các mẫu thực thi memory-native trong tương lai)

Một server-resolved routing model (mô hình định tuyến được giải quyết bởi máy chủ) là more truthful (thật hơn) và more extensible (dễ mở rộng hơn).

---

## Mô Hình Định Tuyến Runtime Cấp Cao (High-Level Runtime Routing Model)

Ở high-level (cấp cao), một conversation request (yêu cầu hội thoại) flows through (chảy qua) các routing stages (giai đoạn định tuyến) này:

1. request enters chat API layer (request đi vào lớp API chat)
2. server identifies conversation context (máy chủ xác định ngữ cảnh hội thoại)
3. server identifies whether a workspace is involved (máy chủ xác định workspace có involved hay không)
4. server resolves any operating-profile influence (máy chủ giải quyết bất kỳ influence nào của operating-profile)
5. runtime mode is mapped server-side (chế độ runtime được ánh xạ phía server)
6. model/provider behavior is selected accordingly (hành vi model/provider được chọn cho phù hợp)
7. response is returned with optional debug visibility (phản hồi được trả về với debug visibility tùy chọn)

Điều này nghĩa là backend là final authority (quyền lực cuối cùng) về effective runtime mode (chế độ runtime có hiệu lực).

---

## Key Context Sources (Các Nguồn Context Quan Trọng)

## 1. Conversation Context (Ngữ Cảnh Hội Thoại)

Server first needs to understand (đầu tiên cần hiểu) conversation nào request belongs to (thuộc về).

### Tại Sao Quan Trọng (Why It Matters)
Conversation state (trạng thái hội thoại) có thể determine (xác định):
- whether a request is part of a general chat flow (request có phải một phần của general chat flow không)
- whether it is attached to a workspace-backed flow (có attached vào workspace-backed flow không)
- whether historical or contextual routing rules should apply (các quy tắc routing lịch sử hoặc ngữ cảnh có nên áp dụng không)

---

## 2. Workspace Context (Ngữ Cảnh Workspace)

Workspace context là một major architectural routing input (đầu vào định tuyến kiến trúc chính).

### Tại Sao Quan Trọng
Một workspace-backed conversation có thể carry (mang theo):
- stronger organizational context (ngữ cảnh tổ chức mạnh hơn)
- different memory expectations (kỳ vọng bộ nhớ khác nhau)
- profile-linked runtime behavior (hành vi runtime liên kết profile)
- future retrieval/context differences (sự khác biệt retrieval/context trong tương lai)

Đây là một trong những reasons (lý do) platform (nền tảng) moving away from (chuyển sang) universal chat-mode toggle model.

---

## 3. Operating Profile Context (Ngữ Cảnh Hồ Sơ Vận Hành)

Operating profiles (hồ sơ vận hành) intended to shape (hình thành) runtime behavior more honestly (trung thực hơn) than a generic "fast vs quality" UI switch.

### Tại Sao Quan Trọng
Một operating profile có thể express (biểu đạt):
- expected depth/behavior (độ sâu/hành vi kỳ vọng)
- cost/latency tradeoffs (sự đánh đổi chi phí/độ trễ)
- future preference structures (cấu trúc preference tương lai)
- mode-selection logic aligned with the user/workspace model (logic chọn chế độ phù hợp với mô hình user/workspace)

Điều này makes runtime routing a platform behavior (làm cho runtime routing trở thành hành vi nền tảng), not just a UI preference.

---

## General vs Workspace-Backed Conversations (Các Cuộc Hội Thoại Chung vs Có Workspace-Backed)

## General / Pre-Workspace Behavior (Hành Vi Chung / Trước Workspace)

Trước khi một conversation truly anchored (thực sự neo đậu) trong một workspace/profile structure (cấu trúc), platform đã moved toward (chuyển hướng) một simplified (đơn giản hóa) và more honest default behavior.

### Practical Outcome (Kết Quả Thực Tế)
User-facing pre-workspace mode là effectively (hiệu quả):
- **General**

### Tại Sao (Why)
Điều này avoids (tránh) pretending (giả vờ) rằng user is choosing a deep backend mode khi server-side context cho differentiation (phân biệt) đó may not yet exist (có thể chưa tồn tại).

---

## Workspace-Backed Behavior (Hành Vi Có Workspace-Backed)

Một khi conversation associated with (liên kết với) workspace và potentially influenced by (có khả năng bị ảnh hưởng bởi) operating profile, runtime routing becomes (trở nên) more context-sensitive (nhạy cảm với ngữ cảnh hơn).

### Practical Outcome
Effective mode (chế độ có hiệu lực) có thể be derived from (được xuất phát từ):
- workspace state (trạng thái workspace)
- operating profile signals (tín hiệu hồ sơ vận hành)
- backend mapping logic (logic ánh xạ backend)

Đây là nơi advanced runtime architecture (kiến trúc runtime nâng cao) belongs (thuộc về).

---

## Server-Side Resolution (Giải Quyết Phía Server)

Current architectural direction (hướng kiến trúc hiện tại) là chat route (tuyến chat) should resolve runtime mode on the server.

### Why This Is Important (Tại Sao Điều Này Quan Trọng)
It ensures that (Nó đảm bảo rằng):
- the effective mode matches actual backend logic (chế độ có hiệu lực khớp với logic backend thực tế)
- UI simplification does not reduce backend flexibility (đơn giản hóa UI không giảm flexibility của backend)
- future routing rules can evolve without lying to the user (các quy tắc routing tương lai có thể evolve mà không lying to user)
- debugging can focus on one authoritative routing layer (gỡ lỗi có thể focus vào một lớp routing có thẩm quyền)

---

## Relationship to UI Controls (Mối Quan Hệ Với Các Điều Khiển UI)

## Old mental model (Mô hình tư duy cũ)
User taps a client-side mode switch và mode is simply whatever the client says it is.

## Current direction (Hướng hiện tại)
Client may expose limited UX state nhưng backend determines effective runtime behavior.

### Why This Matters (Tại Sao Điều Này Quan Trọng)
This prevents a class of misleading UX (một lớp UX gây hiểu lầm) where:
- UI suggests one behavior (UI gợi ý một hành vi)
- server silently does something else (server im lặng làm điều khác)

Một smaller, more honest client surface (bề mặt client nhỏ hơn, trung thực hơn) tốt hơn larger fake-control surface.

---

## Debugging Aids (Các Công Cụ Hỗ Trợ Gỡ Lỗi)

System has used debug headers (đã sử dụng debug headers) để make runtime behavior more inspectable (làm cho hành vi runtime dễ kiểm tra hơn).

### Known Examples (Ví Dụ Đã Biết)
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

### Why These Help (Tại Sao Chúng Giúp)
They allow the team to verify (Chúng cho phép team xác minh):
- what mode the server actually resolved (chế độ nào server thực sự resolved)
- what model path was chosen (đường dẫn model nào được chọn)
- whether runtime routing aligns with expectations under different conversation/workspace states (runtime routing có align với kỳ vọng dưới các trạng thái conversation/workspace khác nhau không)

Các headers này especially useful (đặc biệt hữu ích) khi debugging differences between (gỡ lỗi sự khác biệt giữa):
- general conversation flows (các luồng hội thoại chung)
- workspace-backed conversation flows
- profile-influenced routing (routing bị ảnh hưởng bởi profile)

---

## Current Architectural Intent (Ý Định Kiến Trúc Hiện Tại)

Runtime routing should increasingly reflect this principle (nên ngày càng phản ánh nguyên tắc này):

> the system should choose behavior based on application context rather than asking the user to simulate backend routing manually.

Điều này more aligned with (phù hợp hơn với) broader platform direction (hướng nền tảng rộng hơn) toward:
- workspace-centric behavior
- operating-profile-derived runtime logic
- memory/context-aware execution

---

## Common Failure Modes (Các Chế Độ Thất Bại Phổ Biến)

## 1. UI/Backend Mismatch (Không Khớp UI/Backend)
Frontend presents a mode label (trình bày nhãn chế độ) that does not match actual backend routing behavior.

## 2. Context Loss (Mất Ngữ Cảnh)
Backend fails to recover (không thể khôi phục) the right conversation/workspace/profile context, causing fallback to a less specific mode than intended (gây ra fallback về chế độ ít cụ thể hơn ý định).

## 3. Debug Opacity (Trong Suốt Gỡ Lỗi / Không Minh Bạch)
System resolves a mode internally (giải quyết chế độ nội bộ) nhưng gives too little visibility for verification (cho quá ít khả năng thấy để xác minh).

## 4. Overgrowth of Client Controls (Sự Phát Triển Quá Mức Của Các Điều Khiển Client)
Frontend accumulates (tích lũy) too many mode toggles trước khi backend context model mature enough (đủ chín) để justify them (chứng minh cho chúng).

---

## Why "General" Matters (Tại Sao "General" Quan Trọng)

The introduction of a simpler **General** mode on pre-workspace flows không phải là regression (suy thoái). Nó là một truthfulness improvement (cải tiến sự trung thực).

### What It Avoids (Nó Tránh Những Gì)
- fake precision in the UI (độ chính xác giả trong UI)
- premature exposure of backend routing complexity (tiếp xúc quá sớm với độ phức tạp routing backend)
- misleading promises about control that the backend does not truly honor yet (lời hứa gây hiểu lầm về control mà backend chưa truly honor)

### What It Enables (Nó Cho Phép Những Gì)
- cleaner runtime architecture (kiến trúc runtime sạch hơn)
- stronger future workspace/profile routing (routing workspace/profile tương lai mạnh hơn)
- simpler debugging (gỡ lỗi đơn giản hơn)
- more trustworthy UX (UX đáng tin cậy hơn)

---

## Forward Direction (Hướng Tiến Tới)

Routing model này becomes more powerful (trở nên mạnh mẽ hơn) as other systems mature (khi các hệ thống khác chín muồi), especially (đặc biệt):
- operating profile design
- memory/context preparation
- workspace-first application flows
- retrieval and context-layer composition

Over time (Theo thời gian), runtime mode routing can become a richer policy layer (một lớp policy phong phú hơn) rather than a simple mode switch (chuyển chế độ đơn giản).

---

## Recommended Related Docs (Các Tài Liệu Liên Quan Được Khuyến Nghị)

This document should be read alongside (nên được đọc cùng với):
- `docs/architecture/system-architecture.md`
- `docs/security/public-routes.md`
- future `docs/architecture/memory-and-context-architecture.md`
- future API/runtime reference docs

---

## Summary (Tóm Tắt)

The most important idea is simple (Ý tưởng quan trọng nhất rất đơn giản):

**Genie AI should resolve runtime behavior from context on the server, not pretend the client alone controls the final mode.**

Đó là backbone (xương sống) của một honest (chân thực) và extensible (có thể mở rộng) AI platform architecture.