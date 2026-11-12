# API Reference (Tài Liệu Tham Khảo API)

## Mục Đích (Purpose)

Tài liệu này cung cấp một practical reference (tham khảo thực tế) cho các important Genie AI API surfaces (bề mặt API quan trọng).

Nó not intended to be a generated OpenAPI replacement (không nhằm trở thành generated OpenAPI replacement). Instead (Thay vào đó), it is a human-readable operational reference for (là một operational reference đọc được bởi con người cho):
- developers (nhà phát triển)
- maintainers (người bảo trì)
- collaborators (người cộng tác)
- reviewers (người xem xét)

The emphasis is on clarity (Điểm nhấn là sự rõ ràng):
- what the route does (route làm gì)
- whether it is public or protected (có phải public hay protected)
- what inputs and outputs matter (input/output nào quan trọng)
- what side effects to expect (side effects nào được kỳ vọng)
- what truth surface to use when debugging it (truth surface nào dùng khi debugging)

---

## Route Classification Model (Mô Hình Phân Loại Route)

This reference uses the following route categories (Reference này sử dụng các route categories sau):

### Public (Công Khai)
Accessible without normal user authentication (Có thể truy cập mà không cần normal user authentication), usually because the route supports public UX or external integration (thường vì route hỗ trợ public UX hoặc external integration).

### Protected (Được Bảo Vệ / Yêu Cầu Xác Thực)
Requires authenticated user context (Yêu cầu authenticated user context).

### Integration / Callback (Tích Hợp / Callback)
Externally reachable for a narrow integration purpose (Có thể truy cập từ bên ngoài cho một integration purpose hẹp). Reachability does not imply broad trust (Khả năng truy cập không imply broad trust).

### Automation / Cron (Tự Động Hóa / Cron)
Used by scheduled or background workflows (Được sử dụng bởi scheduled hoặc background workflows).

### Terminal / Raw SSE
Raw Server-Sent Event streams intended for CLI tools, integrations, and non-browser clients (Raw SSE streams dành cho CLI tools, integrations, và non-browser clients). These routes omit typical JSON envelopes and require explicit client parsers (Các routes này omit typical JSON envelopes và require explicit client parsers).

---

## Core Product APIs (Core Product APIs)

## `POST /api/chat`

- Category: Protected
- Purpose: Primary chat execution route (Route thực thi chat chính).
- Responsibilities: receive chat requests, resolve conversation and workspace context, execute provider/model flow, return assistant response metadata (Nhận chat requests, resolve conversation và workspace context, execute provider/model flow, return assistant response metadata).
- Truth surface for debugging: API runtime truth, live runtime truth, source-of-code truth.

---

## `GET /api/conversations`
## `POST /api/conversations`

- Category: Protected
- Purpose: Manage conversation collection state for authenticated users (Quản lý conversation collection state cho authenticated users).
- Responsibilities: list or create conversations, support workspace-aware routing (list hoặc create conversations, support workspace-aware routing).
- Truth surface for debugging: API runtime truth, database/schema truth.

---

## `POST /api/conversations/new`

- Category: Protected
- Purpose: Create a new conversation flow entry point (Tạo mới conversation flow entry point).
- Responsibilities: initialize a new conversation and expected UI state (Khởi tạo new conversation và expected UI state).
- Truth surface for debugging: API runtime truth, database/schema truth, frontend/runtime truth.

---

## `GET /api/conversations/[id]`
## `PATCH /api/conversations/[id]`
## `DELETE /api/conversations/[id]`

- Category: Protected
- Purpose: Fetch, update, or delete a specific conversation (Fetch, update, hoặc delete một specific conversation).
- Truth surface for debugging: API runtime truth, database/schema truth, live runtime truth.

---

## `GET /api/workspaces`
## `POST /api/workspaces`

- Category: Protected
- Purpose: Manage workspace records (Quản lý workspace records).
- Truth surface for debugging: API runtime truth, database/schema truth.

---

## `GET /api/workspaces/default`

- Category: Protected
- Purpose: Resolve the default workspace for the current user (Resolve default workspace cho current user).
- Truth surface for debugging: API runtime truth, database/schema truth, live runtime truth.

---

## `GET /api/operating-profiles`
## `POST /api/operating-profiles`

- Category: Protected
- Purpose: Manage operating-profile records (Quản lý operating-profile records).
- Truth surface for debugging: API runtime truth, database/schema truth.

---

## `GET /api/operating-profiles/default`

- Category: Protected
- Purpose: Resolve the default operating profile for the current context/user (Resolve default operating profile cho current context/user).
- Truth surface for debugging: API runtime truth, database/schema truth.

---

## `POST /api/onboarding/complete`

- Category: Protected
- Purpose: Finalize onboarding and create/attach required product state (Hoàn tất onboarding và create/attach required product state).
- Known risk class: highly sensitive to schema truth (Rất nhạy cảm với schema truth).
- Truth surface for debugging: API runtime truth, database/schema truth, live runtime truth.

---

## Terminal / Raw SSE APIs

## `POST /api/cli/stream`

- Category: Terminal / Raw SSE
- Purpose: Stream assistant replies and local execution control envelopes for terminal-native consumers (Stream assistant replies và local execution control envelopes cho terminal-native consumers). This route is the bridge between the web app runtime and shell-driven CLI clients (Route này là bridge giữa web app runtime và shell-driven CLI clients).
- Auth: bearer token when `LATTICE_CLI_TOKEN` is configured; otherwise unauthenticated in local setups (bearer token khi `LATTICE_CLI_TOKEN` được cấu hình; ngược lại unauthenticated trong local setups).
- Request `Content-Type`: `application/json`
- Response `Content-Type`: `text/event-stream`
- Truth surface for debugging: API runtime truth, conversation engine truth, local CLI shim logs.

### Request shape (Hình Dạng Request)

```json
{
  "messages": [
    {
      "role": "user",
      "text": "list files in the current project"
    }
  ],
  "options": {
    "localMode": true,
    "memoryPlan": null,
    "sudoPromptNames": ["BashSafety", "CLIStreamer", "ToolRouter"]
  }
}
```

### Example cURL

```bash
curl -N -X POST http://localhost:3000/api/cli/stream \
  -H "Content-Type: application/json" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTICE_CLI_TOKEN" \
  -d '{"messages":[{"role":"user","text":"list files"}],"options":{"localMode":true}}'
```

### Notes (Ghi Chú)

- Events are SSE frames with line-buffered framing (Events là SSE frames với line-buffered framing).
- Local execution control envelopes arrive as JSON inside `data:` lines (Local execution control envelopes đến dưới dạng JSON bên trong `data:` lines).
- Final completion is signaled by an event-name control frame rather than HTTP close alone (Final completion được signaled bởi event-name control frame thay vì HTTP close đơn độc).
- See `docs/reference/cli-stream-sse.md` for exact event taxonomy and parsing rules (Xem `docs/reference/cli-stream-sse.md` cho exact event taxonomy và parsing rules).

---

## `GET /api/memory/cli`

- Category: Terminal / Raw SSE API
- Purpose: Read and write CLI memory entries through a token-protected interface (Đọc và ghi CLI memory entries qua một token-protected interface).
- Auth: Same bearer model as `/api/cli/stream` (Cùng bearer model với `/api/cli/stream`).
- Truth surface for debugging: API runtime truth, memory service truth, vector store truth.

### Example cURL

```bash
curl -sS "http://localhost:3000/api/memory/cli?limit=20" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTICE_CLI_TOKEN"
```

### Notes

- Use this for inspecting CLI memory reads/writes without the full dashboard path (Dùng này để inspecting CLI memory reads/writes mà không cần full dashboard path).
- Local shim memory writes route through this API in CLI-enabled flows (Local shim memory writes route qua API này trong CLI-enabled flows).

---

## Feedback and support APIs (Feedback Và Support APIs)

## `POST /api/feedback`

- Category: Protected
- Purpose: Submit feedback (Gửi feedback).
- Truth surface for debugging: API runtime truth, downstream transport truth.

## `POST /api/support`

- Category: Protected
- Purpose: Submit support messages (Gửi support messages).
- Truth surface for debugging: API runtime truth, downstream transport truth.

## `POST /api/guest-chat`

- Category: Public
- Purpose: Public guest chat surface (Public guest chat surface).
- Known risk class: monitor for abuse exposure and scope clarity (Giám sát abuse exposure và scope clarity).
- Truth surface for debugging: API runtime truth, runtime mode routing truth.

---

## Error envelope guidance (Hướng Dẫn Error Envelope)

Many routes return JSON error envelopes (Nhiều routes return JSON error envelopes). The exact shape may not be fully standardized yet (Exact shape có thể chưa fully standardized).

```json
{
  "error": "Unauthorized"
}
```

```json
{
  "status": "error",
  "error_code": "unauthorized",
  "message": "You must be signed in to access this resource."
}
```

Where differences remain, document explicit route behavior in this reference as needed (Ở nơi differences vẫn còn, document explicit route behavior trong reference này as needed).