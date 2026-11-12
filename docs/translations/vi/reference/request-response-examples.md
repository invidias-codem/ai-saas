# Ví Dụ Request Và Response (Request and Response Examples)

Tài liệu này cung cấp (provides) concrete request and response shapes (hình dạng request và response cụ thể) cho các important Lattice OS API surfaces (bề mặt API quan trọng).

Nó meant to complement `docs/reference/api-reference.md` by making the platform easier to understand at the payload level (Nó nhằm complement `docs/reference/api-reference.md` bằng cách làm cho platform dễ hiểu hơn ở payload level).

When debugging raw SSE streams, proxy configs, or terminal clients, start with cURL (Khi debugging raw SSE streams, proxy configs, hoặc terminal clients, hãy bắt đầu với cURL) Use Node or Python examples for integration implementation (Sử dụng Node hoặc Python examples cho integration implementation).

---

## `POST /api/cli/stream`

### Example request (Ví Dụ Request)

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
  -H "Authorization: Bearer $LATTI...OKEN" \
  -d '{"messages":[{"role":"user","text":"list files"}],"options":{"localMode":true}}'
```

### Example Node fetch

```js
const res = await fetch('http://localhost:3000/api/cli/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-lattice-user-id': 'local-dev',
    Authorization: `Bearer ${process.env.LATTICE_CLI_TOKEN}`,
  },
  body: JSON.stringify({
    messages: [{ role: 'user', text: 'list files' }],
    options: { localMode: true },
  }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('event:')) continue;
    if (trimmed.startsWith('data:')) {
      const raw = trimmed.slice(5).trim();
      if (!raw || raw.startsWith('{')) continue;
      process.stdout.write(raw);
    }
  }
}
```

### Example Python requests

```python
import requests

resp = requests.post(
    'http://localhost:3000/api/cli/stream',
    headers={
        'Content-Type': 'application/json',
        'x-lattice-user-id': 'local-dev',
        'Authorization': f"Bearer {open('/path/to/token').read().strip()}",
    },
    json={
        'messages': [{'role': 'user', 'text': 'list files'}],
        'options': {'localMode': True},
    },
    stream=True,
)

for line in resp.iter_lines(decode_unicode=True):
    if not line or line.startswith('event:'):
        continue
    if line.startswith('data:'):
        raw = line[5:].strip()
        if not raw or raw.startswith('{'):
            continue
        print(raw, end='')
```

### SSE event examples (Các Ví Dụ Sự Kiện SSE)

Plain text chunk:

```
event: message
data: partial assistant text
```

Typed content delta:

```
event: content_block_delta
data: {"type":"text_delta","text":"chunk"}
```

Block stop:

```
event: content_block_stop
data: {"type":"text"}
```

Message stop:

```
event: message_stop
data: {"type":"message_stop"}
```

Completion:

```
event: done
data: {"done":true}
```

Stream-level error:

```
event: error
data: {"error":"stream error"}
```

Local execution control:

```
event: message
data: {"execution":{"local":true,"command":"ls -la","cwd":"/Users/jjem/Projects/ai-saas"}}
```

Local command result from CLI shim:

```
event: local_result
data: {"command":"ls -la","mode":"local","status":"exit:0","stdout":"...","stderr":""}
```

---

## `GET /api/memory/cli`

### Example request

```bash
curl -sS "http://localhost:3000/api/memory/cli?limit=20" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTI...OKEN"
```

### Example Node fetch

```js
const res = await fetch('http://localhost:3000/api/memory/cli?limit=20', {
  headers: {
    'x-lattice-user-id': 'local-dev',
    Authorization: `Bearer ${process.env.LATTICE_CLI_TOKEN}`,
  },
});

const data = await res.json();
```

### Example Python requests

```python
import requests

resp = requests.get(
    'http://localhost:3000/api/memory/cli',
    params={'limit': 20},
    headers={
        'x-lattice-user-id': 'local-dev',
        'Authorization': f"Bearer {open('/path/to/token').read().strip()}",
    },
)

print(resp.json())
```

---

## Complex tool-heavy agent flow (Luồng Agent Phức Tạp Có Nhiều Tool)

This example shows a single assistant message that issues four `tool_use` blocks and one final text block across a streaming SSE session (Ví dụ này shows một single assistant message that issues bốn `tool_use` blocks và một final text block qua một streaming SSE session) It is common for agentic workflows to produce multiple sequential tool calls (Điều này common cho agentic workflows produce multiple sequential tool calls).

### What to expect (Điều Kỳ Vọng)

The assistant message contains blocks in this order (Assistant message chứa blocks theo thứ tự này):
1. text
2. tool_use
3. tool_use
4. tool_use
5. tool_use
6. text

### Fragmented tool-call args (Các Tham Số Tool-Call Bị Tách Nhỏ)

Tool args may arrive in several deltas (Tool args có thể arrive trong several deltas) Do not parse until `content_block_stop` (Không parse cho đến `content_block_stop`).

Example deltas for block 2:

```
event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"{\"command\":\" \"ls\""}

event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"\"}\""}
```

Buffered args after stop:

```json
{"command":"ls"}
```

### Full block sequence sample (Mẫu Chuỗi Block Hoàn Chỉnh)

```
event: content_block_delta
data: {"type":"text_delta","text":"I checked the listed files."}

event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"{\"command\":\"ls\"}"}

event: content_block_stop
data: {"type":"tool_use"}

event: content_block_delta
data: {"type":"tool_use","id":"tool_2","args":"{\"command\":\"pwd\"}"}

event: content_block_stop
data: {"type":"tool_use"}

event: content_block_delta
data: {"type":"tool_use","id":"tool_3","args":"{\"command\":\"git rev-parse --show-toplevel\"}"}

event: content_block_stop
data: {"type":"tool_use"}

event: content_block_delta
data: {"type":"tool_use","id":"tool_4","args":"{\"command\":\"date -u +%Y-%m-%dT%H:%M:%SZ\"}"}

event: content_block_stop
data: {"type":"tool_use"}

event: content_block_delta
data: {"type":"text_delta","text":"Done. Results are above."}

event: content_block_stop
data: {"type":"text"}

event: message_stop
data: {"type":"message_stop"}
```

### Client parsing rules for tool-heavy messages (Quy Tắc Parse Client Cho Tin Nhắn Tool-Heavy)

1. Buffer `content_block_delta` payloads by `id` and block `type` (Buffer `content_block_delta` payloads theo `id` và block `type`)
2. Treat `tool_use` exactly like `text` for framing purposes (Xử lý `tool_use` chính xác như `text` cho framing purposes)
3. Only call `JSON.parse` after `content_block_stop` for that block (Chỉ call `JSON.parse` sau `content_block_stop` cho block đó)
4. Execute tool calls sequentially (Thực thi tool calls tuần tự)
5. Finalize state on `message_stop` and stop reading on `done` (Finalize state trên `message_stop` và dừng đọc trên `done`)

### Why this matters (Tại Sao Điều Này Quan Trọng)

If the client parses partial tool JSON too early, the shell loop receives malformed args and silently drops tool calls (Nếu client parses partial tool JSON too early, shell loop receives malformed args và silently drops tool calls) If it ignores `event:` boundaries, control signals can be lost across chunk boundaries (Nếu nó ignores `event:` boundaries, control signals có thể lost across chunk boundaries) The combination of buffered block assembly and stop-gated parsing prevents both classes of failure (Sự kết hợp của buffered block assembly và stop-gated parsing prevents both classes of failure).

---

## `POST /api/chat`

### Example request

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Help me summarize the last conversation."
    }
  ],
  "conversationId": "conv_123",
  "workspaceId": "ws_456"
}
```

### Example Node fetch

```js
const res = await fetch('http://localhost:3000/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.NEXT_PUBLIC_ANON_KEY || ''}`,
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Help me summarize the last conversation.' }],
    conversationId: 'conv_123',
    workspaceId: 'ws_456',
  }),
});

const data = await res.json();
```

### Example Python requests

```python
import requests

resp = requests.post(
    'http://localhost:3000/api/chat',
    json={
        'messages': [{'role': 'user', 'content': 'Help me summarize the last conversation.'}],
        'conversationId': 'conv_123',
        'workspaceId': 'ws_456',
    },
)

print(resp.json())
```

### Notes (Ghi Chú)

Actual runtime behavior may also be validated through headers when backend debugging is enabled (Actual runtime behavior cũng có thể được validated through headers khi backend debugging enabled):
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

---

## Debugging notes (Ghi Chú Debugging)

When a CLI client hangs (Khi CLI client hangs):
1. Inspect whether chunks are still flowing (Inspect xem chunks có vẫn flowing không)
2. Check for missing `message_stop` on tool-heavy outputs (Check missing `message_stop` trên tool-heavy outputs)
3. Check proxy keepalive and buffering behavior (Check proxy keepalive và buffering behavior)
4. Use raw cURL to rule out client parsing bugs (Dùng raw cURL để rule out client parsing bugs)

When `/api/cli/stream` returns `401` (Khi `/api/cli/stream` returns `401`):
1. Verify `x-lattice-user-id` is present (Verify `x-lattice-user-id` is present)
2. Verify `Authorization: Bearer ***` header value matches `LATTICE_CLI_TOKEN` (Verify `Authorization: Bearer ***` header value matches `LATTICE_CLI_TOKEN`)
3. Ensure no proxy strips auth headers (Đảm bảo no proxy strips auth headers)