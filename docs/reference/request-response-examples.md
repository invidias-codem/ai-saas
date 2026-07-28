# Request and Response Examples

This document provides concrete request and response shapes for important Lattice OS API surfaces.

It is meant to complement `docs/reference/api-reference.md` by making the platform easier to understand at the payload level.

When debugging raw SSE streams, proxy configs, or terminal clients, start with cURL. Use Node or Python examples for integration implementation.

---

## `POST /api/cli/stream`

### Example request

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

### SSE event examples

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
  -H "Authorization: Bearer $LATTICE_CLI_TOKEN"
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

## Complex tool-heavy agent flow

This example shows a single assistant message that issues four `tool_use` blocks and one final text block across a streaming SSE session. It is common for agentic workflows to produce multiple sequential tool calls.

### What to expect

The assistant message contains blocks in this order:
1. text
2. tool_use
3. tool_use
4. tool_use
5. tool_use
6. text

### Fragmented tool-call args

Tool args may arrive in several deltas. Do not parse until `content_block_stop`.

Example deltas for block 2:

```
event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"{\"command\":" \"ls\""}

event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"\""}"}
```

Buffered args after stop:

```json
{"command":"ls"}
```

### Full block sequence sample

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

### Client parsing rules for tool-heavy messages

1. Buffer `content_block_delta` payloads by `id` and block `type`.
2. Treat `tool_use` exactly like `text` for framing purposes.
3. Only call `JSON.parse` after `content_block_stop` for that block.
4. Execute tool calls sequentially.
5. Finalize state on `message_stop` and stop reading on `done`.

### Why this matters

If the client parses partial tool JSON too early, the shell loop receives malformed args and silently drops tool calls. If it ignores `event:` boundaries, control signals can be lost across chunk boundaries. The combination of buffered block assembly and stop-gated parsing prevents both classes of failure.

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

### Notes
Actual runtime behavior may also be validated through headers when backend debugging is enabled:
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

---

## Debugging notes

When a CLI client hangs:
1. Inspect whether chunks are still flowing.
2. Check for missing `message_stop` on tool-heavy outputs.
3. Check proxy keepalive and buffering behavior.
4. Use raw cURL to rule out client parsing bugs.

When `/api/cli/stream` returns `401`:
1. Verify `x-lattice-user-id` is present.
2. Verify `Authorization: Bearer ...` header value matches `LATTICE_CLI_TOKEN`.
3. Ensure no proxy strips auth headers.
