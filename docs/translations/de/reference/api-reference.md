# API-Referenz

## Zweck

Dieses Dokument bietet eine praktische Referenz für wichtige Genie AI API-Oberflächen.

Es ist nicht als generierter OpenAPI-Ersatz gedacht. Stattdessen ist es eine für Menschen lesbare operative Referenz für:
- Entwickler
- Maintainer
- Kollaborateure
- Reviewer

Der Fokus liegt auf Klarheit:
- was die Route tut
- ob sie öffentlich oder geschützt ist
- welche Inputs und Outputs wichtig sind
- welche Side Effects zu erwarten sind
- welche Truth Surface beim Debuggen zu nutzen ist

---

## Routen-Klassifikations-Modell

Diese Referenz nutzt folgende Routen-Kategorien:

### Öffentlich
Ohne normale User-Authentifizierung zugänglich, meist weil die Route öffentliche UX oder externe Integration unterstützt.

### Geschützt
Benötigt authentifizierten User-Kontext.

### Integration / Callback
Extern erreichbar für einen engen Integrationszweck. Erreichbarkeit impliziert nicht breites Vertrauen.

### Automatisierung / Cron
Wird von geplanten oder Background-Workflows genutzt.

### Terminal / Raw SSE
Rohe Server-Sent Event Streams für CLI-Tools, Integrationen und Non-Browser-Clients. Diese Routen lassen typische JSON-Envelopes weg und brauchen explizite Client-Parser.

---

## Core Product APIs

## `POST /api/chat`

- Kategorie: Geschützt
- Zweck: Primäre Chat-Ausführungs-Route.
- Verantwortlichkeiten: Chat-Requests empfangen, Conversation- und Workspace-Kontext auflösen, Provider/Model-Flow ausführen, Assistant-Response-Metadata zurückgeben.
- Truth Surface für Debugging: API Runtime Truth, Live Runtime Truth, Source-of-Code Truth.

---

## `GET /api/conversations`
## `POST /api/conversations`

- Kategorie: Geschützt
- Zweck: Conversation Collection State für authentifizierte User managen.
- Verantwortlichkeiten: Conversations listen oder erstellen, workspace-aware Routing unterstützen.
- Truth Surface für Debugging: API Runtime Truth, Database/Schema Truth.

---

## `POST /api/conversations/new`

- Kategorie: Geschützt
- Zweck: Neuen Conversation Flow Entry Point erstellen.
- Verantwortlichkeiten: Neue Conversation und erwarteten UI-State initialisieren.
- Truth Surface für Debugging: API Runtime Truth, Database/Schema Truth, Frontend/Runtime Truth.

---

## `GET /api/conversations/[id]`
## `PATCH /api/conversations/[id]`
## `DELETE /api/conversations/[id]`

- Kategorie: Geschützt
- Zweck: Spezifische Conversation fetchen, updaten oder löschen.
- Truth Surface für Debugging: API Runtime Truth, Database/Schema Truth, Live Runtime Truth.

---

## `GET /api/workspaces`
## `POST /api/workspaces`

- Kategorie: Geschützt
- Zweck: Workspace Records managen.
- Truth Surface für Debugging: API Runtime Truth, Database/Schema Truth.

---

## `GET /api/workspaces/default`

- Kategorie: Geschützt
- Zweck: Default Workspace für aktuellen User auflösen.
- Truth Surface für Debugging: API Runtime Truth, Database/Schema Truth, Live Runtime Truth.

---

## `GET /api/operating-profiles`
## `POST /api/operating-profiles`

- Kategorie: Geschützt
- Zweck: Operating-Profile Records managen.
- Truth Surface für Debugging: API Runtime Truth, Database/Schema Truth.

---

## `GET /api/operating-profiles/default`

- Kategorie: Geschützt
- Zweck: Default Operating Profile für aktuellen Kontext/User auflösen.
- Truth Surface für Debugging: API Runtime Truth, Database/Schema Truth.

---

## `POST /api/onboarding/complete`

- Kategorie: Geschützt
- Zweck: Onboarding finalisieren und required Product State erstellen/attachen.
- Bekannte Risk Class: hochsensitiv für Schema Truth.
- Truth Surface für Debugging: API Runtime Truth, Database/Schema Truth, Live Runtime Truth.

---

## Terminal / Raw SSE APIs

## `POST /api/cli/stream`

- Kategorie: Terminal / Raw SSE
- Zweck: Assistant Replies und Local Execution Control Envelopes für terminal-native Consumers streamen. Diese Route ist die Bridge zwischen Web App Runtime und shell-driven CLI Clients.
- Auth: Bearer Token wenn `LATTICE_CLI_TOKEN` konfiguriert; sonst unauthenticated in lokalen Setups.
- Request `Content-Type`: `application/json`
- Response `Content-Type`: `text/event-stream`
- Truth Surface für Debugging: API Runtime Truth, Conversation Engine Truth, Local CLI Shim Logs.

### Request Shape

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

### Notes

- Events sind SSE Frames mit line-buffered Framing.
- Local Execution Control Envelopes kommen als JSON in `data:` Lines an.
- Final Completion wird durch event-name Control Frame signalisiert statt nur HTTP Close.
- Siehe `docs/reference/cli-stream-sse.md` für exact Event Taxonomy und Parsing Rules.

---

## `GET /api/memory/cli`

- Kategorie: Terminal / Raw SSE API
- Zweck: CLI Memory Entries durch token-protected Interface lesen/schreiben.
- Auth: Gleiches Bearer Model wie `/api/cli/stream`.
- Truth Surface für Debugging: API Runtime Truth, Memory Service Truth, Vector Store Truth.

### Example cURL

```bash
curl -sS "http://localhost:3000/api/memory/cli?limit=20" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTI...OKEN"
```

### Notes

- Nutzen für Inspektion von CLI Memory Reads/Writes ohne vollen Dashboard Path.
- Local Shim Memory Writes routen durch diese API in CLI-enabled Flows.

---

## Feedback und Support APIs

## `POST /api/feedback`

- Kategorie: Geschützt
- Zweck: Feedback submitten.
- Truth Surface für Debugging: API Runtime Truth, Downstream Transport Truth.

## `POST /api/support`

- Kategorie: Geschützt
- Zweck: Support Messages submitten.
- Truth Surface für Debugging: API Runtime Truth, Downstream Transport Truth.

## `POST /api/guest-chat`

- Kategorie: Öffentlich
- Zweck: Öffentliche Guest Chat Surface.
- Bekannte Risk Class: Monitor für Abuse Exposure und Scope Clarity.
- Truth Surface für Debugging: API Runtime Truth, Runtime Mode Routing Truth.

---

## Error Envelope Guidance

Viele Routes geben JSON Error Envelopes zurück. Die exact Shape ist eventuell noch nicht fully standardized.

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

Wo Unterschiede bleiben, explicit Route Behavior in dieser Reference dokumentieren as needed.