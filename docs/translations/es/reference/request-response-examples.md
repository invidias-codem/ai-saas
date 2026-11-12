# Ejemplos de Request y Response

Este documento proporciona formas concretas de request y response para superficies importantes de la API de Lattice OS.

Está pensado para complementar `docs/reference/api-reference.md` haciendo la plataforma más fácil de entender a nivel de payload.

Al depurar streams SSE raw, configs de proxy, o clientes terminal, empieza con cURL. Usa ejemplos Node o Python para implementación de integración.

---

## `POST /api/cli/stream`

### Request de ejemplo

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

### Ejemplo cURL

```bash
curl -N -X POST http://localhost:3000/api/cli/stream \
  -H "Content-Type: application/json" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTI...OKEN" \
  -d '{"messages":[{"role":"user","text":"list files"}],"options":{"localMode":true}}'
```

### Ejemplo Node fetch

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

### Ejemplo Python requests

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

### Ejemplos de eventos SSE

Chunk de texto plano:

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

Error a nivel de stream:

```
event: error
data: {"error":"stream error"}
```

Control de ejecución local:

```
event: message
data: {"execution":{"local":true,"command":"ls -la","cwd":"/Users/jjem/Projects/ai-saas"}}
```

Resultado de comando local desde CLI shim:

```
event: local_result
data: {"command":"ls -la","mode":"local","status":"exit:0","stdout":"...","stderr":""}
```

---

## `GET /api/memory/cli`

### Request de ejemplo

```bash
curl -sS "http://localhost:3000/api/memory/cli?limit=20" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTI...OKEN"
```

### Ejemplo Node fetch

```js
const res = await fetch('http://localhost:3000/api/memory/cli?limit=20', {
  headers: {
    'x-lattice-user-id': 'local-dev',
    Authorization: `Bearer ${process.env.LATTICE_CLI_TOKEN}`,
  },
});

const data = await res.json();
```

### Ejemplo Python requests

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

## Flujo complejo de agente con muchas tools

Este ejemplo muestra un único mensaje de asistente que emite cuatro bloques `tool_use` y un bloque final de texto a través de una sesión SSE streaming. Es común que flujos de trabajo agénticos produzcan múltiples llamadas de herramienta secuenciales.

### Qué esperar

El mensaje del asistente contiene bloques en este orden:
1. text
2. tool_use
3. tool_use
4. tool_use
5. tool_use
6. text

### Args de tool-call fragmentados

Los args de tool pueden llegar en varios deltas. No parsear hasta `content_block_stop`.

Deltas de ejemplo para bloque 2:

```
event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"{\"command\":\" \"ls\""}

event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"\"}\""}
```

Args bufferizados después de stop:

```json
{"command":"ls"}
```

### Muestra de secuencia completa de bloques

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

### Reglas de parsing de cliente para mensajes tool-heavy

1. Buffer `content_block_delta` payloads por `id` y block `type`.
2. Tratar `tool_use` exactamente como `text` para propósitos de framing.
3. Solo llamar `JSON.parse` después de `content_block_stop` para ese bloque.
4. Ejecutar tool calls secuencialmente.
5. Finalizar estado en `message_stop` y dejar de leer en `done`.

### Por qué importa

Si el cliente parsea JSON de tool parcial demasiado temprano, el shell loop recibe args malformados y silenciosamente droppea tool calls. Si ignora límites `event:`, señales de control pueden perderse a través de límites de chunk. La combinación de ensamblaje de bloque bufferizado y parsing gated por stop previene ambas clases de fallo.

---

## `POST /api/chat`

### Request de ejemplo

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

### Ejemplo Node fetch

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

### Ejemplo Python requests

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

### Notas

El comportamiento de runtime actual también puede validarse a través de headers cuando el debugging backend está habilitado:
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

---

## Notas de depuración

Cuando un cliente CLI se cuelga:
1. Inspeccionar si los chunks siguen fluyendo.
2. Verificar `message_stop` faltante en outputs tool-heavy.
3. Verificar comportamiento de proxy keepalive y buffering.
4. Usar cURL raw para descartar bugs de parsing de cliente.

Cuando `/api/cli/stream` retorna `401`:
1. Verificar que `x-lattice-user-id` está presente.
2. Verificar que `Authorization: Bearer ***` header value coincide con `LATTICE_CLI_TOKEN`.
3. Asegurar que ningún proxy quita headers de auth.