# Vertrauensgrenzen (Trust Boundaries)

## Zweck

Dieses Dokument erklärt die wichtigsten Vertrauensgrenzen in Genie AI / `ai-saas`.

Es existiert, weil die Plattform keine Single-Surface-Application ist. Sie beinhaltet:
- öffentliche Landing und Informational Routes
- authentifizierte Product Routes
- API Routes
- Cron/Automation Jobs
- Integrationen und Webhooks
- lokale Development und Operational Surfaces

Wenn diese Surfaces nicht klar getrennt sind, wird das System schwerer zu sichern, schwerer zu verstehen und leichter versehentlich zu brechen.

Dieses Dokument beschreibt das aktuelle Trust Model auf einer praktischen architektonischen Ebene.

---

## Kernprinzip

Nicht jede Surface der Application sollte gleich vertraut werden.

Eine gesunde Architecture unterscheidet zwischen:
- wer auf eine Surface zugreifen darf
- was diese Surface tun darf
- welche Annahmen das Backend über den Caller machen darf

Trust Boundaries sind nicht nur Authentifizierung. Sie betreffen auch:
- Execution Rights
- Data Exposure
- Operational Authority
- Integration Privileges
- System-to-System Assumptions

---

## Primäre Trust Zones

Genie AI sollte als Betrieb über mehrere große Trust Zones verstanden werden.

## 1. Public Visitor Zone

### Who this includes
- unauthenticated Web Visitors
- Public Readers von Landing/Support/Blog/Docs/Privacy-style Surfaces

### What this zone should access
- Public Marketing Pages
- Public Documentation
- Public Support und Policy Content
- Explicitly Public Entry Flows wie Sign-In/Sign-Up

### What this zone should NOT access
- Authenticated User Data
- Protected Product Routes
- Private API Behavior
- Mutation Surfaces die User Identity assumieren

### Key Risk
Eine Public-Looking Page kann trotzdem blocked oder misrouted sein wenn Route Gating nicht korrekt konfiguriert ist.

---

## 2. Authenticated User Zone

### Who this includes
- Signed-In End Users die das Product intentional durch unterstützte Product Routes nutzen

### What this zone should access
- Workspace und Conversation Surfaces
- User Settings
- Authenticated APIs
- Product Features scoped zu ihrer Identity und Permissions

### What this zone should NOT automatically access
- Unrestricted Internal Admin Behavior
- Backend-Only Automation Privileges
- Other Users' State by Default
- Integration Secrets oder Privileged System Tools

### Key Note
Authentication ist notwendig aber nicht ausreichend. Das System sollte noch Feature- und Data-Level Boundaries innerhalb authentifizierter Nutzung respektieren.

---

## 3. Backend Application Zone

### Who this includes
- Server-Side Route Handlers
- Internal Product Logic
- Trusted Backend Execution Paths

### What this zone can do
- Runtime Behavior resolven
- Trusted Configuration accessen
- Providers mit Server-Side Credentials callen
- Protected State schreiben wenn appropriate
- Mediieren zwischen UI Requests und Persistence/Integration Systems

### Why this matters
Der Backend Application Layer ist eine Trust Boundary weil er mehr Authority hat als ein Public Client. Er sollte nicht einfach Client Requests blind spiegeln.

---

## 4. Automation / Cron Zone

### Who this includes
- Scheduled Jobs
- Background Automation Flows
- Task Runners die Internal API Routes hitten

### What this zone can do
- Maintenance/Update Workflows ausführen
- Scheduled Integration Behavior performen
- Privileged Automation Routes accessen wo explicitly intended

### Why this matters
Automation Routes sind oft Public in Transport Terms (sie müssen reachable sein), aber sie sind nicht "Public" im normalen User-Trust Sense.

Sie erfordern:
- Narrow Scope
- Strong Verification
- Clear Operational Intent

### Key Risk
Eine Route die extern reachable ist für Cron/Webhook Reasons bedeutet nicht dass sie sich wie ein ordinärer Public Endpoint verhalten sollte.

---

## 5. Integration / Webhook Zone

### Who this includes
- Slack Callbacks
- Telegram Webhooks
- External Providers oder Platform Callbacks
- Other Third-Party Event Sources

### What this zone should be trusted for
- Only das spezifische Behavior validated für diese Integration

### What it should NOT be trusted for by default
- Arbitrary Product Actions
- Unrestricted Internal State Mutation
- Broad Authenticated-User Equivalence

### Why this matters
External Callbacks können legitim sein aber noch untrusted bis validated durch:
- Signing Secrets
- Verification Tokens
- Route-Specific Checks
- Payload Validation

---

## 6. Data / Persistence Zone

### Who this includes
- Database-Backed Product State
- Structured Persistence Systems
- Schema-Backed Application Behavior

### Trust Boundary Function
Die Persistence Layer sollte unterscheiden zwischen:
- Public-Readable Data
- Authenticated User Data
- Internal System State
- Automation-Only oder Admin-Only Mutation Paths

### Why this matters
Eine Database Row existing impliziert nicht dass jede App Surface allowed sein sollte sie zu lesen oder zu mutieren.

Das ist besonders wichtig wenn Product Architecture schneller evolviert als Policy Clarity.

---

## 7. Scoping Model: Users, Workspaces, Documents, and Retrieval

Viele Failures die wie "AI Bugs" aussehen sind eigentlich Scoping oder Trust-Boundary Bugs.

Die wichtigsten Scoping Layers sind:

### User Boundary
Ein fehlender Workspace bedeutet nicht fehlenden Scope.
Personal Documents und Personal Conversations gehören noch zu einer User Boundary und dürfen nie als globally unscoped behandelt werden.

### Workspace Boundary
Wenn ein Workspace existiert, ist er der primäre Collaborative/Project Scope für:
- Documents
- Conversations
- Retrieval
- Memory/Context Assembly

Ein Document attached zu Workspace A sollte nicht stillschweigend Workspace B beeinflussen.

### Document Boundary
Documents sind First-Class Scoped Objects, nicht nur transient Chat Attachments.
Ein Document kann sein:
- Personal
- Workspace-Scoped
- Warm
- Compressing
- Cold

Chat sollte Document Identity oder Retrieved Chunks referenzieren, nicht wiederholt Raw Document Bodies transportieren.

### Retrieval Boundary
Retrieval Requests sollten den schmalsten relevanten Scope nutzen.
Preferred Scope Anchors sind:
1. Explicit Document IDs
2. Workspace ID wenn present
3. User Ownership wenn Workspace absent

Zwei Failure Modes matter hier:
- **Over-Scoping**: Valid Context wird geskippt weil Scope Field absent ist
- **Under-Scoping**: Unrelated Documents leaken in Results weil Scope zu broad ist

### Preview Boundary
Preview ist ein Direct Document Read/Hydration Path, nicht das Gleiche wie Retrieval.
Preview sollte validieren:
- Auth
- Document Identity
- User/Workspace Access Rights

Eine Preview Route sollte keinen Workspace requiren wenn das Document legitim Personal ist.

### Runtime/Provider Boundary
Infrastructure oder Provider Differences dürfen nicht stillschweigend die Bedeutung von User/Workspace/Document Scope ändern.
Ob Lattice mit verschiedenen Models, Storage, oder Retrieval Backends läuft, Scoping Semantics sollten stabil bleiben.

---

## 8. Local Development / Operator Zone

### Who this includes
- Developers mit Local Repo Access
- Local Scripts und Tooling
- Operator/Debug Surfaces
- Machine-Local Environment State

### Why this matters
Local Access ist hoch privilegiert, aber auch einer der einfachsten Places für Truth Confusion und Accidental Leakage.

### Risks in this zone
- Local Drift mistaken für Source Truth
- Secrets/Config Mishandling
- Local-Only Fixes assumed to represent Production Behavior
- Build oder Schema Assumptions inferred von Unhealthy Machine State

Dies ist eine Trust Zone weil Operator Actions oft dramatisch Normal Application Permissions überschreiten.

---

## 9. Terminal / Raw SSE + Local Sandbox Zone

### Who this includes
- CLI Clients und Local Shell Loops
- Machine-Local Automation calling `/api/cli/stream` und `/api/memory/cli`
- Local Approval-Matrix Behavior in `~/.lattice/settings`

### Why this matters
Diese Zone ist technisch Remote-Backed aber Authority ist split zwischen:
- Der Server Stream API
- Local Client Trust Decisions
- User-Gated Execution im Shell Loop

Es ist nicht Public, und nicht equivalent zu Normal Authenticated Product Usage.

### Rules in this zone
- `/api/cli/stream` und `/api/memory/cli` requiren Bearer-Token Auth wenn `LATTICE_CLI_TOKEN` konfiguriert ist
- Local Approval Modes affect Execution Authority, nicht Server Trust
- Bearer Tokens müssen nicht wie Anonymous oder Public Credentials behandelt werden
- Proxy oder Transport Layers dürfen diese Routes nicht als Public durch Omission exponieren

---

## Boundary Types

Trust Boundaries in diesem System erscheinen in mehreren Formen.

## A. Route Boundary
Ob eine Route Public, Authenticated, oder Restricted ist.

## B. Data Boundary
Ob eine Surface bestimmte State Classes lesen oder mutieren kann.

## C. Execution Boundary
Ob ein Caller High-Authority Logic triggern kann.

## D. Integration Boundary
Ob ein External System allowed ist einen Narrow Callback oder Broader Action Surface zu invoken.

## E. Operational Boundary
Ob ein Local oder Backend Actor als Development/Operator Surface statt Normal User Surface behandelt wird.

---

## Public vs Protected Is Not the Whole Story

Ein häufiger Fehler ist alles Security Thinking in ein Binary zu collapsen:
- Public
- Authenticated

Das reicht nicht für diese Platform.

Beispiel:
- Eine Cron Route kann Transport-Public aber Operationally Privileged sein
- Ein Signed-In User ist Authenticated aber sollte nicht automatisch Admin-Like Power bekommen
- Ein Webhook Endpoint kann Reachable sein aber nur Valid für ein Narrow Integration Behavior

Trust Boundaries müssen diese Distinctions reflektieren.

---

## Examples of Boundary Discipline in Practice

## Example 1 — Public Docs Route
Eine Docs Route kann Public in UI Intent sein, aber unless der Auth Gate sie als Public behandelt, bekommen Unauthenticated Users gebounced.

### Lesson
Public-Route Intent muss match Actual Route Gating.

---

## Example 2 — Authenticated Product APIs
Ein Signed-In User kann Product APIs nutzen, aber das bedeutet nicht dass der Server jeden Client Claim als Authoritative akzeptieren sollte.

### Lesson
Das Backend muss noch Real Behavior mit Trusted Context resolven.

---

## Example 3 — Cron or Webhook Routes
Eine Route kann Externally Callable sein während sie noch zu einer Privileged Automation Boundary gehört.

### Lesson
Reachability ist nicht das Gleiche wie Broad Trust.

---

## Example 4 — Database Schema Presence
Eine Table existing im Repo oder Local Database bedeutet nicht dass das Production System assume sollte dass sie überall existiert oder dass jeder Caller allowed sein sollte sie zu nutzen.

### Lesson
Schema Truth und Access Policy sind Separate Concerns.

---

## Common Boundary Failures to Avoid

## 1. UI Intent Without Backend Enforcement
Eine Page sieht Public aus aber ist noch durch Middleware Protected.

## 2. Client Assertions Treated as Trusted Truth
Das Frontend claimed ein Mode, State, oder Decision das das Backend wirklich selbst resolven sollte.

## 3. Overbroad Callback Trust
Eine Integration/Webhook Route accepted mehr Authority als ihr Narrow Purpose erfordert.

## 4. Authenticated Equals Admin Drift
Signed-In Users behandelt als ob sie automatisch Internal oder Privileged Logic accessen sollten.

## 5. Local Operator Confusion
Local Environment Behavior wird für Production Reality oder Canonical Architecture gehalten.

---

## Boundary Review Checklist

Wenn eine neue Route, Feature, oder Integration hinzugefügt wird, fragen:

1. In welcher Trust Zone ist der Caller?
2. Was ist die Minimum Authority diese Surface braucht?
3. Welcher State ist Readable von diesem Path?
4. Welcher State ist Writable von diesem Path?
5. Welche Assumptions macht das Backend über den Caller?
6. Ist das eine Public Route, Authenticated Route, Privileged Backend Route, oder Narrow Integration Route?
7. Wenn die Route Externally Reachable ist, ist sie noch Tightly Bounded in Behavior?

---

## Relationship to Other Docs

Dieses Dokument sollte neben gelesen werden:
- `docs/security/public-routes.md`
- `docs/architecture/system-architecture.md`
- `docs/operations/truth-surfaces.md`
- Future API und Trust/Reference Documentation

Public Route Documentation erklärt **Visibility**.
Dieses Trust-Boundary Dokument erklärt **Authority**.

---

## Summary

Die wichtigste Security Idea für dieses Codebase ist diese:

**Behandle nicht alle Reachable Surfaces, Authenticated Users, oder External Callbacks als gleich Trusted.**

Genie AI ist eine Multi-Surface Platform, und ihre Security hängt davon ab diese Surfaces Legible, Narrow, und Appropriately Bounded zu halten.