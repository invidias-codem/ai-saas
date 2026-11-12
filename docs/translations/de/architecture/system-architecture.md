# Systemarchitektur

Lattice OS ist eine workspace-zentrische, betriebsprofil-bewusste, speichernative KI-Plattform. Die Implementierung ist als pnpm-verwaltetes Monorepo organisiert, das plattformagnostische Logik von delivery-spezifischen Adaptern trennt.

## Monorepo-Layout

| Paket | Rolle |
|---------|------|
| `apps/web` | Next.js 14+ Frontend (App Router, Clerk Auth, UI) |
| `packages/lattice-core` | Zod-validierte Contracts, Konstanten, Lizenz-/Preflight-Schemas |
| `packages/lattice-mcp-local` | Lokaler MCP stdio Adapter |
| `packages/lattice-mcp-remote` | Remote MCP HTTP Adapter (Clerk-authentifiziert) |
| `packages/lattice-ai-skills` | AI Skills Adapter: SKILL.md Schema, Slash-Commands, Wrapper, Custom GPT Manifest |

Die Next.js-Root-App hängt von den Workspace-Paketen in `workspace:*` Versionen ab und baut sie während des `prebuild`-Schritts.

## Ebenen-Mapping

| Architektonische Ebene | Implementierung |
|---------------------|----------------|
| Öffentliche Web-Oberfläche | `app/(landing)/*` und `app/(public)/beta/*` |
| Authentifizierte Oberfläche | `app/(dashboard)/*` mit Clerk Middleware |
| API/Server-Verhalten | `app/api/**/*` Route Handler |
| Persistenz | Supabase + PostgreSQL (nur serverseitig) |
| Automatisierung/Integration | Cron Jobs, Webhook-Routen, MCP-Adapter |
| Terminal / Raw SSE | `/api/cli/stream`, `/api/memory/cli`, lokaler CLI Shim-Pfad |

## Build & Deploy

- Build-Reihenfolge: `prebuild` führt `pnpm --dir packages/lattice-{core,mcp-local,mcp-remote,ai-skills} run build` zuerst aus, damit `dist/` vor dem Next.js-Bundling existiert.
- Vercel: `.vercelignore` erlaubt `packages/lattice-*` (nur `packages/ucol-node/` ist ausgeschlossen). Der Prebuild-Fix und der NFT-gescoppte dynamische require sind in `package.json` und `next.config.mjs`.

---
...
Dieses Dokument bietet eine hochwertige Erklärung der aktuellen Systemarchitektur von Lattice OS.

Es soll beantworten:
- welche die wichtigsten Systemebenen sind
- wie Anfragen durch das System fließen
- wo State lebt
- wie öffentliche, authentifizierte und Backend-Automatisierungs-Oberflächen sich unterscheiden
- welche architektonischen Themen zentral für die Produktausrichtung sind

Dieses Dokument ist ein Backbone-Architektur-Überblick, keine vollständige Subsystem-Spezifikation.

---

## Hochlevel-Ansicht

Auf breiter Ebene besteht Lattice OS aus sechs Hauptarchitektur-Ebenen:

1. **Öffentliche Web-Oberfläche**
2. **Authentifizierte Anwendungs-Oberfläche**
3. **API- und Server-Verhaltensebene**
4. **Daten- / Persistenzebene**
5. **Automatisierungs- / Integrations-Ebene**
6. **Terminal- / Raw-SSE-Ebene**

Diese Ebenen sind verbunden, bedienen aber unterschiedliche Zielgruppen und haben unterschiedliche Vertrauensgrenzen.

---

## 1. Öffentliche Web-Oberfläche

### Was sie umfasst
- Landing Pages
- Öffentliche Informationsseiten
- Blog/Docs/Support/Privacy-Seiten
- Andere nicht-authentifizierte Marketing- oder Informations-Oberflächen

### Verantwortlichkeiten
- Das Produkt erklären
- Discovery unterstützen
- Öffentliche Dokumentations- und Support-Einstiegspunkte bereitstellen
- Nutzer bei Bedarf in Sign-Up oder Produkt-Oberflächen leiten

### Architektonische Hinweise
- Diese Routen sollten öffentlich zugänglich bleiben
- Sie sollten nicht versehentlich Annahmen des authentifizierten Dashboards erben
- Routen-Gating-Bugs auf dieser Ebene erzeugen schnell benutzerseitige Vertrauensprobleme

---

## 2. Authentifizierte Anwendungs-Oberfläche

### Was sie umfasst
- Dashboard
- Gespräche (Conversations)
- Workspaces
- Onboarding
- Einstellungen
- Andere benutzer-spezifische Anwendungs-Flows

### Verantwortlichkeiten
- Benutzer-spezifischen Produkt-State halten
- Echte KI-Interaktions-Workflows antreiben
- Workspace-bewusstes und Profil-bewusstes Verhalten exponieren
- Produkt-Funktionalität bereitstellen statt nur Marketing/Informations-Inhalt

### Architektonische Hinweise
- Diese Ebene hängt von authentifizierter Identität ab
- Sie hängt zunehmend von Workspace- und Operating-Profile-Kontext ab
- Sie sollte nicht als dasselbe System wie die Landing-Oberfläche mit Auth on Top behandelt werden

---

## 3. API- und Server-Verhaltensebene

### Was sie umfasst
- Route Handler unter `app/api/...`
- Serverseitige Runtime-Auswahl-Logik
- Conversation-Orchestrierungs-Logik
- Integrations-Callbacks und Cron-Endpoints

### Verantwortlichkeiten
- Chat und Anwendungs-Aktionen verarbeiten
- Serverseitiges Verhalten auflösen
- Strukturierte Interfaces zwischen UI und Backend-Logik bereitstellen
- Geschützte/öffentliche API-Grenzen durchsetzen
- Geplante und externe Workflows unterstützen

### Wichtige architektonische Richtung
Eine Schlüsselrichtung im System ist, mehr Verhaltenswahrheit in die Server-Ebene zu bewegen, besonders um:
- Runtime-Modus-Auswahl
- Workspace-bewusstes Verhalten
- Operating-Profile-bewusste Entscheidungsfindung

Das reduziert irreführenden Client-seitigen State und macht Verhalten inspizierbarer.

---

## 4. Daten- / Persistenzebene

### Was sie umfasst
- Supabase / PostgreSQL-gestützte strukturierte Daten
- Relationaler Anwendungs-State
- Entstehender Memory/Retrieval-bezogener State und unterstützende Persistenz

### Verantwortlichkeiten
- Benutzer-/Anwendungsdaten persistieren
- Workspace- und Profil-Modelle unterstützen
- Conversations und andere Produkt-Strukturen unterstützen
- Geplante/Integrations-Workflows unterstützen, die durablen State brauchen

### Architektonischer Hinweis
Die Persistenzebene ist nicht nur ein passiver Storage-Bucket. Sie unterstützt zunehmend architektonische Transitionen im Produkt, besonders um:
- Workspace-First-Verhalten
- Profil-abgeleitete Runtime-Entscheidungen
- Memory/Context-System-Evolution

---

## 5. Automatisierungs- / Integrations-Ebene

### Was sie umfasst
- Cron-getriggerte Routen
- Webhook-Endpoints
- Integrations-Callbacks
- Social/Distribution-Automatisierung
- Externe Messaging/Integrations-Flows

### Verantwortlichkeiten
- Geplante Tasks koordinieren
- Externe Plattform-Events handhaben
- Nicht-UI-Workflows warten
- Produkt-Logik mit externen Systemen verbinden

### Architektonischer Hinweis
Diese Ebene sollte als Teil des Produktionssystems verstanden werden, nicht als "extra Skripte". Sie kann materiell beeinflussen:
- Produkt-Verhalten
- Öffentliche Ausgaben
- Operatives Risiko
- Debugging-Komplexität

---

## 6. Terminal- / Raw-SSE-Ebene

### Was sie umfasst
- `/api/cli/stream`
- `/api/memory/cli`
- Lokale CLI-Shims und terminal-native Konsumenten

### Verantwortlichkeiten
- Assistant-Antworten als Raw SSE streamen
- Typisierte Lifecycle-Deltas für Text, Tool-Nutzung, Completion und lokale Ausführung emittieren
- Zeilen-gerahmte Chunk-Semantik über Proxy/CDN-Hops bewahren
- CLI-Orchestrierung, lokale Approval-Matrizen und Memory-Calls ohne Browser-Middleware unterstützen

### Warum das wichtig ist
Diese Ebene ist terminal-native by design. Sie kann sich nicht auf Browser-Retry-Verhalten, ServiceWorker-Buffering oder Framework-Fetch-Wrapper verlassen. Sie hängt ab von:
- Stabiler Chunked-Transfer-Semantik
- Expliziter Event-Taxonomie
- Client-seitigen Timeout- und Recovery-Regeln
- Proxy-Policies, die SSE-Frames nicht puffern oder umschreiben

---

## Querschnitts-Architektur-Themen

## A. Workspace-First-Modell

Ein großer Produkt-Shift im Codebase ist, **Workspace** als primären Runtime-Container zu machen, statt Chat als generische Standalone-Oberfläche zu behandeln.

### Warum es wichtig ist
Workspaces sollen formen:
- Kontext-Scope
- Memory-Verhalten
- Runtime-Auswahl
- Benutzer-Organisation
- Zukünftige Personalisierung und System-Komposition

---

## B. Operating-Profile-getriebenes Runtime-Verhalten

Die System-Richtung umfasst, Verhaltens-Auswahl in ein Modell zu bewegen, wo **Operating Profiles** Runtime-Charakteristiken beeinflussen.

### Warum es wichtig ist
Das erlaubt dem System zu unterstützen:
- Verschiedene Behavior/Cost-Tradeoffs
- Ehrlichere Runtime-Kontrolle
- Zukünftiges Profil-bewusstes KI-Verhalten

Das ist einer der wichtigsten architektonischen Differenzierer im Codebase.

---

## C. Prepared Context über Naïve Raw History

Das System bewegt sich zu einem Prepared-Context-Modell statt nur auf unstrukturierten rollenden Message-History zu vertrauen.

### Warum es wichtig ist
Prepared Context ermöglicht:
- Klarere Prompt-Struktur
- Bessere Memory-Grenzen
- Explizitere Retrieval/Context-Komposition
- Sicherere zukünftige Graph/Retrieval-Augmentation

---

## D. Public-/Protected-Boundary-Disziplin

Weil das Produkt öffentliche Seiten, authentifizierte Seiten, APIs und Callbacks mischt, ist Boundary-Disziplin sehr wichtig.

### Häufiger Failure-Mode
Eine öffentliche UI-Route kann unabsichtlich in eine geschützte Oberfläche verlinken, was eine Sign-In-Wall oder unerwarteten Auth-Bounce erzeugt.

Deshalb muss Routen-Sichtbarkeit sorgfältig dokumentiert und geprüft werden.

---

## Request-Flow (High-Level)

## Public Page Flow
1. User請求公共页面
2. 中间件/代理确定路由是公共的
3. 应用区域设置处理
4. 公共内容在无需身份验证的情况下呈现

## Authentifizierter Produkt-Flow
1. 用户请求经过身份验证的路由
2. 中间件/代理检查认证
3. 用户身份得到解析
4. 本地化应用外壳加载
5. 基于用户/应用程序上下文加载页面特定数据和运行时行为

## Chat-/Runtime-Flow (vereinfacht)
1. Frontend übermittelt Request an API-Ebene
2. Server löst Conversation/Workspace/Profile-Kontext auf
3. Prepared Context wird zusammengesetzt
4. Runtime-Modus/Modell-Verhalten wird serverseitig ausgewählt
5. Model/Provider-Pfad wird ausgeführt
6. Response wird mit optionaler Debug-Sichtbarkeit zurückgegeben (je nach Implementierung)

## Automation-/Cron-Flow
1. Geplanter oder externer Trigger trifft API-Route
2. Route führt serverseitige Task-Logik aus
3. State wird über Persistenzebene gelesen/geschrieben
4. Integrations-/öffentliche Seiteneffekte können je nach Job erzeugt werden

---

## Vertrauensgrenzen

Die Architektur hat mehrere wichtige Vertrauensgrenzen:

### Öffentliche Besucher
- Können auf öffentliche Informations-Oberflächen zugreifen
- Sollten nicht in der Lage sein, geschützten Produkt-State zu mutieren

### Authentifizierte Benutzer
- Können auf produkt-angemessene Oberflächen für ihre Identität und Konfiguration zugreifen

### Backend/Interne Jobs
- Können privilegierte Logik ausführen, die für öffentliche Clients nicht verfügbar ist

### Externe Plattformen
- Können nur durch explizit erlaubte Oberflächen designierte Callback/Webhook-Endpoints aufrufen

Vertrauensgrenz-Verwirrung ist eine der einfachsten Arten, wie diese Art von System fragil werden kann.

---

## Operative Realitäten

Der Codebase hat bereits einige wichtige operative Realitäten aufgedeckt:
- Cloud-Build-Wahrheit kann zuverlässiger sein als lokale Build-Wahrheit
- Deployment-Action-Logs können verrauscht oder verlustbehaftet sein
- Routen-Gating-Issues können schnell Production-Bugs erzeugen
- Architektur-Änderungen brauchen Dokumentation neben der Implementierung, um lesbar zu bleiben

Diese Realitäten sollten als Teil der Architektur behandelt werden, nicht getrennt davon.

---

## Wohin diese Architektur sich entwickelt

Genie AI wird zunehmend:

> eine workspace-zentrische, operating-profile-bewusste, memory-native KI-Plattform mit öffentlichen Discovery-Oberflächen, authentifizierten Execution-Oberflächen und Backend-Automatisierungs-/Integrations-Ebenen.

Diese Beschreibung ist präziser als ein einfacheres "Chatbot-App"-Label.

---

## Empfohlene nächste Architektur-Dokumente

Dieses Backbone-Dokument sollte von spezifischeren Architektur-Dokumenten gefolgt werden für:
- Runtime-Modus-Routing
- Memory- und Context-Architektur
- Public-Route-Grenzen
- Truth Surfaces und Deployment-Verifikation
- API-Referenz-Verhalten