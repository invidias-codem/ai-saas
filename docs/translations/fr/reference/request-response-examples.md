# Exemples de Requêtes et Réponses

Ce document fournit des formes concrètes de requêtes et réponses pour les surfaces importantes de l'API Lattice OS.

Il vise à compléter `docs/reference/api-reference.md` en rendant la plateforme plus facile à comprendre au niveau du payload.

Lors du débogage de flux SSE bruts, configs de proxy, ou clients terminaux, commencez avec cURL. Utilisez des exemples Node ou Python pour l'implémentation d'intégration.

---

## `POST /api/cli/stream`

### Exemple de requête

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

### Exemple cURL

```bash
curl -N -X POST http://localhost:3000/api/cli/stream \
  -H "Content-Type: application/json" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTI...OKEN" \
  -d '{"messages":[{"role":"user","text":"list files"}],"options":{"localMode":true}}'
```

### Exemple Node fetch

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

### Exemple Python requests

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

### Exemples d'événements SSE

Chunk de texte brut :

```
event: message
data: partial assistant text
```

Typed content delta :

```
event: content_block_delta
data: {"type":"text_delta","text":"chunk"}
```

Block stop :

```
event: content_block_stop
data: {"type":"text"}
```

Message stop :

```
event: message_stop
data: {"type":"message_stop"}
```

Completion :

```
event: done
data: {"done":true}
```

Erreur niveau stream :

```
event: error
data: {"error":"stream error"}
```

Contrôle d'exécution locale :

```
event: message
data: {"execution":{"local":true,"command":"ls -la","cwd":"/Users/jjem/Projects/ai-saas"}}
```

Résultat de commande locale depuis CLI shim :

```
event: local_result
data: {"command":"ls -la","mode":"local","status":"exit:0","stdout":"...","stderr":""}
```

---

## `GET /api/memory/cli`

### Exemple de requête

```bash
curl -sS "http://localhost:3000/api/memory/cli?limit=20" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTI...OKEN"
```

### Exemple Node fetch

```js
const res = await fetch('http://localhost:3000/api/memory/cli?limit=20', {
  headers: {
    'x-lattice-user-id': 'local-dev',
    Authorization: `Bearer ${process.env.LATTICE_CLI_TOKEN}`,
  },
});

const data = await res.json();
```

### Exemple Python requests

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

## Flux complexe d'agent avec beaucoup de tools

Cet exemple montre un unique message d'assistant qui émet quatre blocs `tool_use` et un bloc final de texte à travers une session SSE streaming. Il est commun que les workflows agéntiques produisent plusieurs appels d'outil séquentiels.

### À quoi s'attendre

Le message de l'assistant contient des blocs dans cet ordre :
1. text
2. tool_use
3. tool_use
4. tool_use
5. tool_use
6. text

### Args de tool-call fragmentés

Les args de tool peuvent arriver en plusieurs deltas. Ne pas parser avant `content_block_stop`.

Deltas d'exemple pour bloc 2 :

```
event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"{\"command\":\" \"ls\""}

event: content_block_delta
data: {"type":"tool_use","id":"tool_1","args":"\"}\""}
```

Args bufferisés après stop :

```json
{"command":"ls"}
```

### Échantillon de séquence complète de blocs

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

### Règles de parsing client pour messages tool-heavy

1. Buffer `content_block_delta` payloads par `id` et block `type`.
2. Traiter `tool_use` exactement comme `text` pour propósitos de framing.
3. Seulement appeler `JSON.parse` après `content_block_stop` pour ce bloc.
4. Exécuter tool calls séquentiellement.
5. Finaliser state sur `message_stop` et arrêter de lire sur `done`.

### Pourquoi cela importe

Si le client parse le JSON de tool partiel trop tôt, le shell loop reçoit des args malformés et drop silencieusement les tool calls. S'il ignore les frontières `event:`, les signaux de contrôle peuvent être perdus à travers les frontières de chunk. La combinaison d'assemblage de bloc bufferisé et parsing gated par stop previent les deux classes d'échec.

---

## `POST /api/chat`

### Exemple de requête

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

### Exemple Node fetch

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

### Exemple Python requests

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

Le comportement de runtime actuel peut aussi être validé via headers quand le debugging backend est activé :
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

---

## Notes de débogage

Quand un client CLI se bloque :
1. Inspecter si les chunks continuent de couler.
2. Vérifier `message_stop` manquant sur outputs tool-heavy.
3. Vérifier comportement proxy keepalive et buffering.
4. Utiliser cURL brut pour écarter bugs de parsing client.

Quand `/api/cli/stream` retourne `401` :
1. Vérifier que `x-lattice-user-id` est présent.
2. Vérifier que `Authorization: Bearer ***` header value correspond à `LATTICE_CLI_TOKEN`.
3. S'assurer qu'aucun proxy ne retire les headers d'auth.