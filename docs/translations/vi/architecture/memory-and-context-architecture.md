# Kiến Trúc Bộ Nhớ Và Ngữ Cảnh (Memory and Context Architecture)

## Mục Đích

Tài liệu này giải thích Genie AI đang tiến hóa (evolving) kiến trúc bộ nhớ (memory) và ngữ cảnh (context) của mình như thế nào.

Nó tồn tại để làm cho một hướng phát triển sản phẩm cốt lõi (core product direction) trở nên rõ ràng (explicit):
Genie AI không có ý định (intended) vẫn là một thin chat wrapper (wrapper chat mỏng) bao quanh raw rolling history (lịch sử trôi tuôn thô). Nó đang di chuyển (moving toward) một prepared-context architecture (kiến trúc ngữ cảnh được chuẩn bị) có cấu trúc hơn (more structured), workspace-aware (nhận biết không gian làm việc), với stronger boundaries (ranh giới mạnh mẽ hơn) giữa conversation state (trạng thái hội thoại), workspace state, retrieved context (ngữ cảnh được truy xuất), và future memory systems (hệ thống bộ nhớ tương lai).

Tài liệu này tập trung (focuses) vào architectural intent (ý định kiến trúc), current patterns (các mẫu hiện tại), và design direction (hướng thiết kế) thay vì claim (khẳng định) rằng mọi future subsystem (hệ thống con trong tương lai) đã fully realized (hoàn toàn hiện thực hóa).

---

## Nguyên Tắc Cốt Lõi (Core Principle)

Context (ngữ cảnh) nên được **prepared** (chuẩn bị), không merely accumulated (chỉ tích lũy).

Điều đó nghĩa là system (hệ thống) nên increasingly avoid (ngày càng tránh) treating "everything in history" (mọi thứ trong lịch sử) as the only or best source of model context (nguồn ngữ cảnh mô hình duy nhất hoặc tốt nhất).

Thay vào đó (Instead), context nên được assembled (lắp ráp/tổ hợp) từ multiple layers (nhiều lớp) như:
- immediate conversation state (trạng thái hội thoại ngay lập tức)
- workspace context (ngữ cảnh không gian làm việc)
- operating-profile context (ngữ cảnh hồ sơ vận hành)
- retrieved supporting information (thông tin hỗ trợ được truy xuất)
- future memory layers (các lớp bộ nhớ tương lai)

Kiến trúc này more controllable (dễ kiểm soát hơn), more extensible (dễ mở rộng hơn), và more honest (trung thực hơn) về what the system is actually using (cái mà hệ thống thực sự đang sử dụng).

---

## Tại Sao Điều Này Quan Trọng (Why This Matters)

Một naive chat architecture (kiến trúc chat наив/đơn giản) tends to degrade (xu hướng suy giảm) vào one of two patterns (một trong hai mẫu):

1. **Raw transcript stuffing** (nhồi nhét transcript thô)
   - too much irrelevant history (quá nhiều lịch sử không liên quan)
   - unclear relevance (tính liên quan không rõ ràng)
   - context-window waste (lãng phí cửa sổ ngữ cảnh)
   - weaker prompt discipline (kỷ luật prompt yếu hơn)

2. **Opaque hidden retrieval behavior** (hành vi truy xuất ẩn mờ)
   - users and developers cannot tell what information influenced the answer (người dùng và nhà phát triển không thể nói thông tin nào ảnh hưởng đến câu trả lời)
   - debugging becomes difficult (gỡ lỗi trở nên khó khăn)
   - architecture becomes fragile and magical (kiến trúc trở nên mong manh và huyền bí)

Prepared context (ngữ cảnh được chuẩn bị) intended to provide a better middle path (cung cấp một đường giữa tốt hơn).

---

## Các Lớp Kiến Trúc Của Context (Architectural Layers of Context)

At a high level (ở mức độ cao), Genie AI's context architecture nên được understood as (được hiểu là) multiple cooperating layers (nhiều lớp hợp tác).

## 1. Immediate Conversation Context (Ngữ Cảnh Hội Thoại Ngay Lập Tức)

Đây là near-term interaction state (trạng thái tương tác ngắn hạn) directly associated with (liên kết trực tiếp với) active conversation (cuộc hội thoại đang hoạt động).

### Typical contents (Nội dung điển hình)
- recent user/assistant turns (các lượt user/assistant gần đây)
- active prompt/interaction state (trạng thái prompt/tương tác đang hoạt động)
- immediate request framing (khung yêu cầu ngay lập tức)

### Role (Vai Trò)
This provides local conversational coherence (Cái này cung cấp sự liên kết hội thoại cục bộ).

### Limitation (Hạn Chế)
Immediate conversation context alone (chỉ có ngữ cảnh hội thoại ngay lập tức) not enough (không đủ) cho một workspace-centric, memory-aware product.

---

## 2. Workspace Context (Ngữ Cảnh Không Gian Làm Việc)

Workspace context là một major architectural layer (lớp kiến trúc chính) vì product (sản phẩm) is moving toward workspace-first behavior (đang chuyển hướng hành vi workspace-first).

### Typical contents
- workspace identity (danh tính workspace)
- workspace-linked conversation scope (phạm vi hội thoại liên kết workspace)
- relevant persistent organizational context (ngữ cảnh tổ chức liên tục liên quan)
- future workspace memory boundaries (ranh giới bộ nhớ workspace tương lai)

### Role
Workspace context allows the system to behave as though (cho phép hệ thống hành xử như thể) a conversation belongs to a meaningful container (thọ chứa có ý nghĩa) rather than an isolated free-floating thread (luồng nổi tự do bị cô lập).

### Why it matters (Tại sao quan trọng)
Đây là one of the core differences (một trong những cốt lõi khác biệt) giữa một generic chatbot (chatbot chung chung) và một structured intelligence workspace (không gian trí tuệ có cấu trúc) hơn.

---

## 3. Operating Profile Context (Ngữ Cảnh Hồ Sơ Vận Hành)

Operating profiles (hồ sơ vận hành) intended to shape (hình thành) runtime behavior và increasingly (ngày càng) context behavior as well.

### Potential influence (Tác động tiềm năng)
An operating profile can affect (một hồ sơ vận hành có thể ảnh hưởng):
- style of system behavior (phong cách hành vi hệ thống)
- expected depth (độ sâu kỳ vọng)
- runtime tradeoffs (sự đánh đổi runtime)
- future context-selection policies (chính sách lựa chọn ngữ cảnh tương lai)

### Architectural role (Vai trò kiến trúc)
Operating profiles help tie (giúp kết nối) context architecture to the broader platform model (mô hình nền tảng rộng hơn) rather than leaving memory/context as a disconnected subsystem (thay vì để memory/context như một subsystem ngắt kết nối).

---

## 4. Retrieved Supporting Context (Ngữ Cảnh Hỗ Tr� Được Truy Xuất)

System direction (hướng hệ thống) includes retrieving supporting information (bao gồm truy xuất thông tin hỗ trợ) rather than relying only on (thay vì chỉ dựa vào) conversation transcripts.

### Potential sources (Nguồn tiềm năng)
- curated memory layers (các lớp bộ nhớ được tuyển chọn)
- future graph-aware retrieval (truy xuất nhận biết đồ thị trong tương lai)
- structured workspace materials (vật liệu workspace có cấu trúc)
- externally ingested knowledge in bounded contexts (kiến thức được ingest bên ngoài trong các ngữ cảnh bị giới hạn)

### Role
Retrieved context should provide relevance (cung cấp tính liên quan), not indiscriminate bulk (không phải khối lượng vô chọn lọc).

### Important note (Lưu ý quan trọng)
Retrieved context must be prepared and bounded carefully (phải được chuẩn bị và giới hạn cẩn thận). Retrieval is helpful only when it improves relevance and traceability (chỉ hữu ích khi nó cải thiện tính liên quan và khả năng truy vết) rather than adding prompt noise (thay vì thêm nhiễu prompt).

---

## 5. Future Durable Memory Layers (Các Lớp Bộ Nhớ Bền Vững Tương Lai)

Architecture direction (hướng kiến trúc) clearly points toward (chี้ rõ ràng về phía) more durable memory concepts (khái niệm bộ nhớ bền vững hơn), nhưng they should be described carefully (chúng nên được mô tả cẩn thận).

### Memory should not be treated as a single blob (Bộ nhớ không nên được xem như một khối đơn lẻ)
A useful future memory system (một hệ thống bộ nhớ tương lai hữu ích) is likely to involve multiple classes of memory (có khả năng liên quan đến nhiều lớp bộ nhớ), such as (như):
- short-horizon active context (ngữ cảnh hoạt động tầm nhìn ngắn)
- workspace-linked durable context (ngữ cảnh bền vững liên kết workspace)
- structured recall surfaces (các bề mặt hồi tưởng có cấu trúc)
- future graph or retrieval-enhanced memory (bộ nhớ graph hoặc retrieval-enhanced trong tương lai)

### Why this matters (Tại sao điều này quan trọng)
Calling everything "memory" without distinctions (gọi mọi thứ là "memory" nếu không có sự phân biệt) makes the system harder to reason about (làm cho hệ thống khó suy luận hơn) và easier to misrepresent (dễ bị trình bày sai).

---

## Prepared Context as the Central Pattern (Prepared Context Là Pattern Trung Tâm)

Prepared-context idea (ý tưởng ngữ cảnh được chuẩn bị) is one of the most important architectural patterns in Genie AI.

### What it means (Nó có nghĩa là gì)
Rather than passing through raw state as-is (thay vì chuyển qua raw state y nguyên), the system prepares a context package for model execution (hệ thống chuẩn bị một gói ngữ cảnh cho thực thi mô hình).

### A prepared context may include (Một prepared context có thể bao gồm)
- selected conversation history (lịch sử hội thoại được chọn)
- explicit prompt sections (các phần prompt rõ ràng)
- workspace-derived framing (khung được xuất phát từ workspace)
- retrieved supporting material (vật liệu hỗ trợ được truy xuất)
- system instructions organized by purpose (hướng dẫn hệ thống được tổ chức theo mục đích)

### Why this is better (Tại sao điều này tốt hơn)
It enables (Nó cho phép):
- cleaner prompt construction (xây dựng prompt sạch hơn)
- more intentional relevance (tính liên quan có ý định hơn)
- easier debugging (gỡ lỗi dễ dàng hơn)
- future policy control over what enters model context (kiểm soát chính sách tương lai về cái gì đi vào model context)
- reduced dependence on transcript bloat (giảm sự phụ thuộc vào sự phình to của transcript)

---

## Relationship to Memory-Native Direction (Mối Quan Hệ Với Hướng Memory-Native)

Product direction (hướng sản phẩm) has increasingly emphasized (đã ngày càng nhấn mạnh) memory-native architecture.

This should be interpreted carefully (Điều này nên được diễn giải cẩn thận).

### It does not simply mean (Nó không đơn giản có nghĩa là)
- "we save lots of text" (chúng tôi lưu nhiều văn bản)
- "we have embeddings somewhere" (chúng tôi có embeddings ở đâu đó)
- "the assistant remembers everything magically" (trợ lý nhớ mọi thứ theo cách thần kỳ)

### It should mean (Nó nên có nghĩa là)
- memory is treated as a product primitive (bộ nhớ được xử lý như một primitive sản phẩm)
- context assembly has explicit architecture (lắp ráp ngữ cảnh có kiến trúc rõ ràng)
- workspace and runtime behavior can draw from more than a raw chat log (hành vi workspace và runtime có thể rút từ nhiều hơn raw chat log)
- the system is designed for structured recall and future evolution (hệ thống được thiết kế cho structured recall và future evolution)

This is a stronger and more credible interpretation (Đây là một interpretation mạnh mẽ và uy tín hơn).

---

## Graph and Retrieval Direction (Hướng Graph Và Retrieval)

Codebase và surrounding planning (lập kế hoạch xung quanh) have pointed toward (đã chỉ ra hướng) graph-first or graph-augmented retrieval ideas (ý tưởng truy xuất graph-first hoặc graph-augmented).

### Why this matters (Tại sao điều này quan trọng)
A graph-aware direction (một hướng nhận biết graph) suggests the system may eventually treat (gợi ý hệ thống có thể cuối cùng đối xử) relationships between concepts, materials, and workspace objects as first-class retrieval structure (cấu trúc truy xuất hạng nhất) rather than relying only on (thay vì chỉ dựa vào) flat nearest-neighbor lookup (tra cứu nearest-neighbor phẳng).

### Architectural implication (Hàm ý kiến trúc)
If this direction matures (Nếu hướng này chín muồi), memory/context assembly could increasingly involve (lắp ráp memory/context có thể ngày càng liên quan):
- relevance selection (lựa chọn độ liên quan)
- relationship-aware context composition (tổ hợp ngữ cảnh nhận biết mối quan hệ)
- structured support rather than raw passage dumping (hỗ trợ có cấu trúc thay vì dumping đoạn thô)

### Caution (Thận Trọng)
This should be documented as a direction unless and until (Này nên được tài liệu hóa như một hướng trừ khi và cho đến khi) the full production path is implemented and stabilized (đường dẫn sản xuất đầy đủ được triển khai và ổn định).

---

## Boundaries Matter (Ranh Giới Quan Trọng / Ranh Giới Có Ý Nghĩa)

One of the most important parts of a serious memory/context system is boundary discipline (kỷ luật ranh giới).

### Boundaries that matter (Ranh giới có ý nghĩa)
- conversation vs workspace context (hội thoại vs ngữ cảnh workspace)
- user-visible history vs hidden support context (lịch sử nhìn thấy được bởi user vs ngữ cảnh hỗ trợ ẩn)
- temporary context vs durable memory (ngữ cảnh tạm thời vs bộ nhớ bền vững)
- public data vs protected internal state (dữ liệu công khai vs trạng thái nội bộ được bảo vệ)
- retrieved assistance vs system-owned instructions (trợ giúp được truy xuất vs hướng dẫn thuộc hệ thống)

Without these boundaries (Nếu không có các ranh giới này), the system becomes harder to trust (trở nên khó tin cậy hơn) và harder to debug (khó debug hơn).

---

## Debuggability and Transparency (Khả Năng Gỡ Lỗi Và Sự Minh Bạch)

A memory/context architecture is only useful if it can be inspected and reasoned about (chỉ hữu ích nếu nó có thể được kiểm tra và suy luận).

### Good architectural properties (Các thuộc tính kiến trúc tốt)
- developers can explain what kinds of context are being assembled (nhà phát triển có thể giải thích loại ngữ cảnh nào đang được lắp ráp)
- runtime behavior can be debugged when retrieval/context selection feels wrong (hành vi runtime có thể được debug khi retrieval/context selection cảm thấy sai)
- system behavior is not framed as mystical total recall (hành vi hệ thống không được khung khắc như mystical total recall)

### Why this matters (Tại sao điều này quan trọng)
Users and developers should not have to guess (không nên phải đoán) whether an answer came from (câu trả lời đến từ):
- recent turns (các lượt gần đây)
- workspace framing (khung workspace)
- retrieved support data (dữ liệu hỗ trợ được truy xuất)
- hidden durable memory (bộ nhớ bền vững ẩn)

Even if every internal detail is not exposed in the UI (Dù mọi chi tiết internal không bị exposed trong UI), the architecture must remain understandable internally (kiến trúc phải vẫn dễ hiểu bên trong).

---

## Common Failure Modes (Các Chế Độ Thất Bại Phổ Biến)

## 1. Transcript Bloat (Sự Phình To Của Transcript)
Too much raw history enters the prompt without useful selection (Quá nhiều lịch sử thô đi vào prompt mà không có lựa chọn hữu ích).

## 2. Weak Relevance Selection (Lựa Chọn Độ Liên Quan Yếu)
Retrieved material is technically related but not actually useful (Vật liệu truy xuất có liên quan về mặt kỹ thuật nhưng không thực sự hữu ích).

## 3. Hidden Context Confusion (Sự Nhầm Lẫn Của Ngữ Cảnh Ẩn)
The system uses background context that is hard to explain or trace (Hệ thống sử dụng background context khó giải thích hoặc truy vết).

## 4. Boundary Collapse (Sự Sụp Đổ Của Ranh Giới)
Workspace context, conversation context, and durable memory are treated interchangeably (được đối xử như nhau/hoán đổi cho nhau).

## 5. Overclaiming Memory (Khẳng Định Quá Mức Về Bộ Nhớ)
The product presents an impression of stronger persistent understanding than the actual system reliably supports (Sản phẩm trình bày ấn tượng về sự hiểu bền vững mạnh hơn mà hệ thống thực tế reliably supports).

---

## Honest Product Framing (Khung Sản Phẩm Trung Thực / Sản Phẩm Được Khung Hônest)

A transparent memory/context architecture should avoid vague claims like (một kiến trúc memory/context minh bạch nên tránh các khẳng định mơ hồ như):
- "the AI remembers everything" (AI nhớ mọi thứ)
- "the AI truly understands your world" (AI thực sự hiểu thế giới của bạn)

A more honest framing is (Một cách khung honnested hơn là):
- the platform prepares context from multiple relevant layers (nền tảng chuẩn bị ngữ cảnh từ nhiều lớp liên quan)
- workspaces and profiles help scope behavior (workspace và profiles giúp scope hành vi)
- memory and retrieval are being structured as part of the product architecture (bộ nhớ và retrieval đang được cấu trúc như một phần của kiến trúc sản phẩm)
- context is assembled intentionally rather than relying on raw transcript growth alone (ngữ cảnh được lắp ráp có chủ đích thay vì dựa vào sự tăng trưởng raw transcript đơn độc)

This style of explanation builds more trust than inflated language (Phong cách giải thích này xây dựng niềm tin nhiều hơn ngôn ngữ phồng to).

---

## Relationship to Runtime Mode Routing (Mối Quan Hệ Với Điều Hướng Chế Độ Runtime)

Memory/context architecture and runtime mode routing are closely related (liên quan mật thiết).

### Why (Tại Sao)
Different runtime behaviors may increasingly depend on (khác nhau có thể ngày càng phụ thuộc vào):
- how much context is assembled (bao nhiêu context được lắp ráp)
- which layers are included (layer nào được bao gồm)
- how workspace/profile logic influences selection (logic workspace/profile ảnh hưởng selection như thế nào)

This is why memory/context cannot be treated as separate from the rest of the system architecture (Đây là lý do memory/context không thể được xem như tách biệt từ phần còn lại của system architecture).

---

## Forward Direction (Hướng Tiến Tới)

The likely evolution path (Đường đi tiến hóa có khả năng) cho Genie AI's context architecture includes (bao gồm):
- stronger prepared-context pipelines (các pipeline prepared-context mạnh hơn)
- richer workspace-scoped memory behavior (hành vi memory workspace-scoped phong phú hơn)
- better server-side control over context selection (kiểm soát phía server tốt hơn về lựa chọn ngữ cảnh)
- future graph/retrieval augmentation (tăng cường graph/retrieval tương lai)
- improved transparency and debuggability (cải thiện sự minh bạch và khả năng debug)

The goal is not maximal hidden complexity (Mục tiêu không phải là độ phức tạp ẩn tối đa).
The goal is **better relevance, stronger structure, and more truthful system behavior** (Mục tiêu là relevance tốt hơn, structure mạnh hơn, và system behavior trung thực hơn).

---

## Summary (Tóm Tắt)

The key idea is this (Ý tưởng chính là):

**Genie AI should assemble context from structured layers rather than pretending raw chat history alone is a sufficient memory system.**

Đó là foundation (nền tảng) của một serious memory-native platform architecture (kiến trúc nền tảng memory-native nghiêm túc) hơn.

---

## Recommended Related Docs (Các Tài Liệu Liên Quan Được Khuyến Nghị)

This document should be read alongside (Tài liệu này nên được đọc cùng với):
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- future docs on retrieval, API behavior, and trust boundaries (tài liệu tương lai về retrieval, API behavior, và trust boundaries)