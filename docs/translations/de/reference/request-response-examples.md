# Anfrage- und Antwort-Beispiele

Dieses Dokument bietet konkrete Request- und Response-Shapes für wichtige Lattice OS API-Oberflächen.

Es soll `docs/reference/api-reference.md` ergänzen, indem es die Plattform auf Payload-Ebene leichter verständlich macht.

Beim Debuggen von rohen SSE-Streams, Proxy-Configs oder Terminal-Clients, beginnen Sie mit cURL. Nutzen Sie Node- oder Python-Beispiele für Integrations-Implementierung.

---

## `POST /api/cli/stream`

### Beispiel-Request

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

### Beispiel cURL

```bash
curl -N -X POST http://localhost:3000/api/cli/stream \
  -H "Content-Type: application/json" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTI...OKEN" \
  -d '{"messages":[{"role":"user","text":"list files"}],"options":{"localMode":true}}'
```

### Beispiel Node fetch

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

### Beispiel Python requests

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

### SSE Event Beispiele

Plain Text Chunk:

```
event: message
data: partial assistant text
```

Typed Content Delta:

```
event: content_block_delta
data: {"type":"text_delta","text":"chunk"}
```

Block Stop:

```
event: content_block_stop
data: {"type":"text"}
```

Message Stop:

```
event: message_stop
data: {"type":"message_stop"}
```

Completion:

```
event: done
data: {"done":true}
```

Stream-Level Error:

```
event: error
data: {"error":"stream error"}
```

Local Execution Control:

```
event: message
data: {"execution":{"local":true,"command":"ls -la","cwd":"/Users/jjem/Projects/ai-saas"}}
```

Local Command Result von CLI Shim:

```
event: local_result
data: {"command":"ls -la","mode":"local","status":"exit:0","stdout":"...","stderr":""}
```

---

## `GET /api/memory/cli`

### Beispiel-Request

```bash
curl -sS "http://localhost:3000/api/memory/cli?limit=20" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTI...OKEN"
```

### Beispiel Node fetch

```js
const res = await fetch('http://localhost:3000/api/memory/cli?limit=20', {
  headers: {
    'x-lattice-user-id': 'local-dev',
    Authorization: `Bearer ${process.env.LATTICE_CLI_TOKEN}`,
  },
});

const data = await res.json();
```

### Beispiel Python requests

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

## Komplexer Tool-lastiger Agent Flow

Dieses Beispiel zeigt eine einzelne Assistant-Message die vier `tool_use` Blöcke und einen finalen Text-Block über eine streaming SSE Session ausgibt. Es ist üblich für agentic Workflows mehrere sequentielle Tool-Calls zu produzieren.

### Was zu erwarten ist

Die Assistant-Message enthält Blöcke in dieser Reihenfolge:
1. text
2. tool_use
3. tool_use
4. tool_use
5. tool_use
6. text

### Fragmentierte Tool-Call Args

Tool Args können in mehreren Deltas ankommen. Nicht parsen bis `content_block_stop`.

Beispiel-Deltas für Block 2:

```
event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"{\"command\":\" \"ls\""}

event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"\"}\""}
```

Gepufferte Args nach Stop:

```json
{"command":"ls"}
```

### Vollständiger Block-Sequenz Sample

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

### Client Parsing Regeln für Tool-lastige Messages

1. Buffer `content_block_delta` Payloads nach `id` und Block `type`.
2. `tool_use` genau wie `text` für Framing-Zwecke behandeln.
3. Erst `JSON.parse` nach `content_block_stop` für diesen Block aufrufen.
4. Tool Calls sequentiell ausführen.
5. State auf `message_stop` finalisieren und auf `done` aufhören zu lesen.

### Warum das wichtig ist

Wenn der Client partielles Tool-JSON zu früh parst, erhält der Shell-Loop malformierte Args und dropt Tool Calls stillschweigend. Wenn er `event:` Grenzen ignoriert, können Kontrollsignale über Chunk-Grenzen verloren gehen. Die Kombination aus gepuffertem Block-Assembly und Stop-gezogenem Parsing verhindert beide Fehlerklassen.

---

## `POST /api/chat`

### Beispiel-Request

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

### Beispiel Node fetch

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

### Beispiel Python requests

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

Tatsächlicher Runtime-Verhalten kann auch durch Headers validiert werden wenn Backend-Debugging aktiviert ist:
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

---

## Debugging Notes

Wenn ein CLI Client hängt:
1. Inspektieren ob Chunks noch fließen.
2. Check für fehlendes `message_stop` bei tool-lastigen Outputs.
3. Check Proxy Keepalive und Buffering Verhalten.
4. Raw cURL nutzen um Client Parsing Bugs auszuschließen.

Wenn `/api/cli/stream` `401` zurückgibt:
1. Verifizieren dass `x-lattice-user-id` vorhanden ist.
2. Verifizieren dass `Authorization: Bearer ***` Header Value matcht `LATTICE_CLI_TOKEN`.
3. Sicherstellen dass kein Proxy Auth Headers stript.