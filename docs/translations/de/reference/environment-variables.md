# Umgebungsvariablen

## Zweck

Dieses Dokument beschreibt die wichtigsten Umgebungsvariablen, die von Lattice OS / `ai-saas` verwendet werden.

Es soll die Plattform transparenter machen für:
- Entwickler
- Operatoren
- Reviewer
- zukünftige Maintainer

Dies ist kein Secrets-Dump. Es ist eine Referenz dafür, wofür jede Variable ist, welche Surface sie nutzt, und ob sie für öffentliche/Browser-Exposition oder nur serverseitige Nutzung gedacht ist.

---

## Wichtiges Prinzip

Umgebungsvariablen fallen in zwei breite Klassen:

### Öffentliche Variablen
Variablen mit Präfix `NEXT_PUBLIC_` werden erwartet, browser-seitigem Code exponiert zu werden.
Sie dürfen keine Secrets enthalten.

### Server-seitige Variablen
Nicht-`NEXT_PUBLIC_` Variablen sollten als server-seitig only behandelt werden, es sei denn, explizit anders dokumentiert.
Sie können Credentials, Tokens, oder privilegierte Konfiguration tragen.

---

## Source of Truth Note

Das expliziteste typisierte Umgebungs-Schema im aktuellen Codebase ist:
- `lib/env.ts`

Dieses Dokument sollte dieses Schema tracken, aber die live Deployment-Umgebung muss trotzdem separat verifiziert werden beim Debuggen echter Runtime-Issues.

---

## Deployment Mode Guidance

Lattice sollte mode-aware konfiguriert werden statt jeden optionalen Subsystem in jeder Installation zu erfordern.

Operational fällt Konfiguration in diese breiten Klassen:
- **core required**: Werte die für jedes ernsthafte Deployment gebraucht werden
- **mode-specific required**: Werte die nur für bestimmte Deployment-Modes gebraucht werden
- **optional feature config**: Werte die erweiterte oder optionale Capabilities aktivieren

Für die initiale self-hosted Story sollte die Baseline zentriert bleiben auf:
- **Mode A — Standard Internal Deployment**

Das bedeutet ein standard Business Install sollte Konfiguration priorisieren für:
- app/runtime
- authentication
- database
- storage
- mindestens einen supported reasoning provider
- mindestens einen supported embedding provider

Es sollte nicht jeden optionalen Subsystem erfordern (social agents, GPU archival, advanced local retrieval, etc.) es sei denn diese Capabilities sind intentional enabled.

---

## Authentication / Clerk

## `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
### Type
- Öffentlich

### Purpose
Browser-sicherer Clerk publishable key genutzt um client-seitige auth Flows zu initialisieren.

### Used for
- frontend auth Integration
- sign-in/sign-up UX

---

## `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
### Type
- Öffentlich

### Purpose
Optionale explizite sign-in Route Konfiguration für Clerk.

---

## `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
### Type
- Öffentlich

### Purpose
Optionale explizite sign-up Route Konfiguration für Clerk.

---

## `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`
### Type
- Öffentlich

### Purpose
Optionales post-sign-in Redirect Target.

---

## `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL`
### Type
- Öffentlich

### Purpose
Optionales post-sign-out Redirect Target.

---

## `CLERK_SECRET_KEY`
### Type
- Server-only

### Purpose
Server-seitiger Clerk Secret genutzt für privilegierte auth Operationen.

### Security note
Muss niemals als browser-safe behandelt werden.

---

## `CLERK_WEBHOOK_SECRET`
### Type
- Server-only

### Purpose
Validiert Clerk Webhook Calls.

### Security note
Relevant für trust boundaries für Webhook Routes.

---

## AI / Model Provider Variables

## `GOOGLE_API_KEY`
### Type
- Server-only

### Purpose
API Key für Google-basierten AI Provider Zugriff.

### Used for
- model/provider Interaktionen wo die Google API Surface aktiv ist

---

## `GOOGLE_PROJECT_ID`
### Type
- Server-only

### Purpose
Google Cloud Project Identifier.

### Used for
- Google Cloud / Vertex-style Services wo applicable

---

## `GOOGLE_LOCATION`
### Type
- Server-only Konfiguration

### Purpose
Google Region/Location Konfiguration.

### Default in Schema
- `us-central1`

---

## `GCP_SERVICE_ACCOUNT_KEY_JSON`
### Type
- Server-only Secret

### Purpose
Rohes Service-Account JSON genutzt für privilegierten Google Cloud API Zugriff.

### Security note
Hochsensitiv.
Sollte als secret-bearing Server Credential behandelt werden.

---

## `REPLICATE_API_TOKEN`
### Type
- Server-only

### Purpose
Replicate Provider Token für model-backed Generation Paths.

---

## `REPLICATE_API_TOKEN_MUSIC`
### Type
- Server-only

### Purpose
Replicate Token/Konfigurations-Pfad für musik-bezogene Generation Flows.

---

## `REPLICATE_API_TOKEN_VIDEO`
### Type
- Server-only

### Purpose
Replicate Token/Konfigurations-Pfad für video-bezogene Generation Flows.

---

## RAG / Retrieval / Memory Variables

## `NEXT_PUBLIC_RAG_ENABLED`
### Type
- Public Configuration Flag

### Purpose
Kontrolliert ob RAG/memory-bezogenes Verhalten als enabled an der client-facing Config Layer betrachtet wird.

### Default in Schema
- `true`

### Note
Public Configuration Flags sind keine Security Boundaries. Sie sollten nicht als Beweis behandelt werden dass ein Backend Feature safe oder unsafe ist.

---

## `RAG_CLOUD_FUNCTION_URL`
### Type
- Server-side Konfiguration

### Purpose
Endpoint/Konfigurations-Surface für Cloud-Function-backed RAG Verhalten.

---

## `RAG_MEMORY_RETENTION_DAYS`
### Type
- Server-side Konfiguration

### Purpose
Retention-Window Konfiguration für Memory-bezogenes Verhalten.

### Default in Schema
- `90`

---

## `RAG_RETRIEVAL_LIMIT`
### Type
- Server-side Konfiguration

### Purpose
Kontrolliert Retrieval Count/Limit für RAG-bezogenen Context Retrieval.

### Default in Schema
- `5`

---

## `RAG_SIMILARITY_THRESHOLD`
### Type
- Server-side Konfiguration

### Purpose
Kontrolliert Similarity Threshold für Retrieval Logik.

### Default in Schema
- `0.6`

---

## Supabase / Persistence Variables

## `NEXT_PUBLIC_SUPABASE_URL`
### Type
- Öffentlich

### Purpose
Browser-sichere Supabase Project URL genutzt von client-side oder shared Runtime Integration.

---

## `NEXT_PUBLIC_SUPABASE_ANON_KEY`
### Type
- Öffentlich

### Purpose
Browser-sichere Supabase Anon Key für erlaubte Client-side Access Patterns.

### Security note
Public bedeutet nicht unrestricted. Backend/Database Policies müssen trotzdem echte Access Boundaries enforcen.

---

## `SUPABASE_SERVICE_ROLE_KEY`
### Type
- Server-only Secret

### Purpose
Privilegiertes Supabase Service-Role Credential.

### Security note
Muss niemals an Browser-seitigen Code exponiert werden.
Dies ist eine der höchsten-Sensitivität Application Credentials.

---

## Slack Integration Variables

## `SLACK_BOT_TOKEN`
### Type
- Server-only Secret

### Purpose
Slack Bot Token für server-seitiges Slack Integration Verhalten.

---

## `SLACK_SIGNING_SECRET`
### Type
- Server-only Secret

### Purpose
Validiert Slack Callback/Event Authentizität.

---

## `SLACK_APP_ID`
### Type
- Server-side Konfiguration

### Purpose
Slack Application Identifier.

---

## `SLACK_CLIENT_ID`
### Type
- Server-side Konfiguration

### Purpose
Slack OAuth Client ID für Backend Integration Flow.

---

## `SLACK_CLIENT_SECRET`
### Type
- Server-only Secret

### Purpose
Slack OAuth Client Secret.

---

## `NEXT_PUBLIC_SLACK_CLIENT_ID`
### Type
- Öffentlich

### Purpose
Client-facing Slack Integration Support, wie Add to Slack Flows.

---

## Zapier Integration Variables

## `ZAPIER_CLIENT_ID`
### Type
- Server-side Konfiguration

### Purpose
Zapier Integration Client Identifier.

---

## `ZAPIER_CLIENT_SECRET`
### Type
- Server-only Secret

### Purpose
Zapier Integration Secret.

---

## `ZAPIER_API_KEY`
### Type
- Server-only Secret/Konfiguration

### Purpose
Zapier Integration API Access.

---

## GitHub / Agent / Internal Automation Variables

## `GITHUB_AGENT_TOKEN`
### Type
- Server-only Secret

### Purpose
GitHub Token für autonome oder assistierte interne Agent Flows, wie Repo Automatisierung.

---

## `GITHUB_REPO_OWNER`
### Type
- Server-side Konfiguration

### Purpose
Default GitHub Repo Owner Kontext für interne Automatisierung.

---

## `GITHUB_REPO_NAME`
### Type
- Server-side Konfiguration

### Purpose
Default GitHub Repo Name Kontext für interne Automatisierung.

---

## `GITHUB_DEFAULT_BRANCH`
### Type
- Server-side Konfiguration

### Purpose
Default Branch Name genutzt von internen GitHub Automation Flows.

### Default in Schema
- `main`

---

## Webhooks / Cron / Internal Job Variables

## `VERCEL_LOG_WEBHOOK_SECRET`
### Type
- Server-only Secret

### Purpose
Schützt Vercel Log Webhook Handling.

---

## `CRON_SECRET`
### Type
- Server-only Secret

### Purpose
Authentifiziert Cron-getriggerte Route Execution wo Secret-gated Scheduling required ist.

### Security note
Dies ist besonders wichtig weil einige Cron Routes extern erreichbar sein können aber sich nicht wie ordinary Public Endpoints verhalten sollten.

---

## General Usage Guidance

## Use `NEXT_PUBLIC_` only when necessary
Alles präfixiert `NEXT_PUBLIC_` sollte als sichtbar für Client-side Code angenommen werden.

## Prefer typed access through `lib/env.ts`
Das typisierte Schema hilft Intent zu dokumentieren und fängt fehlende Werte klarer als verstreute rohe `process.env` Access.

## Do not confuse presence with correctness
Eine Variable die in einer lokalen `.env` Datei existiert beweist nicht:
- Production hat sie
- Der Wert ist korrekt
- Das live System nutzt sie wie erwartet

Environment Configuration muss trotzdem gegen die actual Deployment Truth Surface verifiziert werden.

---

## Security Guidance

Die sensitivsten Variablen in diesem Set beinhalten:
- `CLERK_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SLACK_SIGNING_SECRET`
- `SLACK_CLIENT_SECRET`
- `SLACK_BOT_TOKEN`
- `GCP_SERVICE_ACCOUNT_KEY_JSON`
- `REPLICATE_API_TOKEN*`
- `GITHUB_AGENT_TOKEN`
- `CRON_SECRET`
- `VERCEL_LOG_WEBHOOK_SECRET`

Diese sollten niemals in Client-side Code, Screenshots, Public Logs, oder committed Plaintext Config exponiert werden.

---

## Related Docs

Dieses Dokument sollte neben gelesen werden:
- `docs/reference/api-reference.md`
- `docs/security/trust-boundaries.md`
- `docs/operations/truth-surfaces.md`
- zukünftige Deployment/Ops Konfiguration Docs

---

## Follow-Up Improvement

Eine zukünftige Verbesserung für diese Reference wäre hinzuzufügen:
- Variable → File/Feature Mapping
- Required/Optional by Environment (Local, Preview, Production)
- Setup Examples für Non-Secret Local Development