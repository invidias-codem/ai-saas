# Workspace- und Operating-Profile-Modell

## Zweck

Dieses Dokument erklärt die Beziehung zwischen **Workspaces** und **Operating Profiles** in Genie AI.

Es existiert, weil dieses Modell einer der wichtigsten Shifts in der Plattform-Architektur und Produkt-Identität ist.

Genie AI evolviert weg von einem einfacheren "Chat plus Tool Pages" Pattern hin zu einem strukturierteren System wo:
- Workspace der primäre organisatorische Container ist
- Operating Profile das Runtime-Verhalten formt
- Conversations zunehmend Kontext von dieser Struktur erben

Dieses Dokument klärt das Modell auf konzeptioneller und architektonischer Ebene.

---

## Kernprinzip

Die Plattform sollte nicht jede Conversation als contextless generischen Chat-Thread behandeln.

Stattdessen:
- **Workspace** provides the container
- **Operating Profile** provides behavioral shape
- **Conversation** wird zum active thread innerhalb dieser Struktur

Das ist das Rückgrat eines memory-native, cost-aware, und context-aware Produkts.

---

## Warum Dieses Modell Existiert

Ein generisches Chatbot-Modell tendiert dazu, alles in eine Surface zu flatten:
- gleiche Context-Assumptions
- gleiche Runtime-Assumptions
- gleiche Cost/Quality-Assumptions
- schwache organisatorische Boundaries

Der Ansatz bricht zusammen wenn die Plattform unterstützen will:
- differenziertes Runtime-Verhalten
- stärkere Context Preparation
- meaningful User Organization
- zukünftige Memory Boundaries
- budget-conscious Product Strategy

Das Workspace + Operating-Profile Modell ist intended to solve that.

---

## Primäre Objekte

## 1. Workspace

### Was es ist
Ein Workspace ist der primäre Container für eine meaningful Unit von User Activity.

### Was es repräsentiert
Ein Workspace kann repräsentieren:
- ein Project
- eine Domain of Work
- einen persistenten Context Container
- eine zukünftige Memory Boundary
- eine Runtime-Scoping Unit

### Warum es wichtig ist
Ein Workspace gibt der Plattform einen Ort um zu attachen:
- Conversations
- Memory/Context Behavior
- zukünftige Knowledge Structures
- Profile-shaped Runtime Assumptions

Ohne ein echtes Workspace-Modell bleiben Context und Behavior zu flat.

---

## 2. Operating Profile

### Was es ist
Ein Operating Profile ist eine structured description davon, wie sich das System für einen gegebenen User/Workspace Context verhalten sollte.

### Was es beeinflusst
Ein Operating Profile kann formen:
- Runtime Mode Selection
- Cost/Latency/Quality Tradeoffs
- zukünftige Context-Selection Policies
- Style und System Behavior Expectations
- wie die Plattform Capability mit Efficiency balanced

### Warum es wichtig ist
Ein Operating Profile ist ehrlicher und extensibler als ein simplistischer "fast / quality / agentic" Mode Toggle zu exponieren ohne genug Backend Context um es properly zu supporten.

---

## 3. Conversation

### Was es ist
Eine Conversation ist der active Interaction Thread innerhalb des Workspace/Profile Modells.

### Warum es wichtig ist
Eine Conversation sollte nicht mehr default als free-floating isoliertes Object behandelt werden.

Stattdessen deriviert eine Conversation zunehmend meaning aus:
- ihrer Workspace Membership
- ihrem Profile-linked Runtime Behavior
- zukünftigen Memory/Context Layers attached an diese Struktur

---

## Relationship Between the Three (Beziehung Zwischen Den Drei)

Auf konzeptioneller Ebene:
- **Workspace** = where the work lives
- **Operating Profile** = how the system should behave in that environment
- **Conversation** = der active thread happening within that structure

Diese Relationship ist eine der wichtigsten Product Abstractions in Genie AI.

---

## Workspace as Primary Container (Workspace Als Primärer Container)

Die Platform Direction treated zunehmend Workspace als main Runtime Container.

### Warum das wichtig ist
Ein Workspace kann anchor:
- Organizational Identity
- Memory Scope
- zukünftiger Retrieval Scope
- Runtime Policy
- Conversation Grouping

### Architektonische Implikation
Das bedeutet Workspace ist nicht nur ein Sidebar Label oder kosmetischer Folder.
Es ist intended to become part of the real Runtime Model.

---

## Operating Profile as Runtime Policy Layer (Operating Profile Als Runtime Policy Layer)

Ein Operating Profile sollte als Policy Layer verstanden werden statt nur als Preference Label.

### Es kann eventually Dinge ausdrücken wie
- ob Behavior mehr für Speed oder Depth optimieren sollte
- ob bestimmte Workflow Patterns expected sind
- was für Context Assembly appropriate ist
- wie man Capability, Cost, und Latency in strukturierterer Weise trade-offed

### Warum das wichtig ist
Das schafft Differenzierung ohne vorzutäuschen, dass es einen universally optimalen expensive Mode für jede Conversation gibt.

Es aligned auch mit der breiteren Product Direction mehr budget-aware und profile-shaped zu sein statt "one premium mode for everything."

---

## Why This Is Better Than Generic Chat Modes (Warum Das Besser Ist Als Generische Chat Modes)

Ein simpler client-side Mode Switch ist easy to expose, aber schwach architektonisch.

### Problems with naive chat modes
- sie können misrepresentieren was das Backend actually does
- sie ignorieren Workspace Context
- sie scale nicht gut in memory-aware Behavior
- sie schaffen oft fake Precision in der UI

### Advantages of workspace + operating profile
- Behavior kann von richer Context derived werden
- Runtime Routing wird ehrlicher
- Product Behavior wird composableer
- zukünftige Memory/Retrieval Layers haben ein stabiles Container Model

---

## Relationship to Runtime Mode Routing (Beziehung zu Runtime Mode Routing)

Das Workspace/Operating-Profile Model ist einer der main reasons warum Runtime Mode Routing zu server-side Resolution moved.

### Warum
Das Backend needs to inspect:
- was für Conversation this is
- welchem Workspace es gehört
- ob ein Profile Behavior formen sollte

Das ist stärker als den Client zu fragen den finalen Mode manuell zu guessen.

---

## Relationship to Memory and Context Architecture (Beziehung zu Memory and Context Architecture)

Das Workspace/Operating-Profile Model mattered auch weil Memory und Context Preparation Boundaries brauchen.

### Workspace kann provide
- Context Scope
- Memory Container Identity
- zukünftige Retrieval Boundary

### Operating Profile kann provide
- Context-Selection Policy Hints
- Expected Behavior Shape
- zukünftige Memory/Runtime Balancing Rules

Deswegen sollten diese Systems together verstanden werden, nicht independently.

---

## General / Pre-Workspace Flows

Die Platform muss noch Users supporten bevor full Workspace Anchoring established ist.

### Current Design Implication
Pre-Workspace oder lightly-scoped Chat ist intentionally simplified und mehr honest.

### Example
Der Move Richtung single **General** Pre-Workspace Mode spiegelt das wider.

### Warum
Es avoids pretending dass die Platform schon den reichen Workspace/Profile Context hat um deeper Backend Behavioral Differentiation zu rechtfertigen.

---

## Onboarding Implications

Ein meaningful Onboarding Flow sollte nicht nur ein User Account erstellen.
Es sollte helfen die actual Runtime Structure der Platform zu instantiieren.

### In praktischen Begriffen, Onboarding sollte Richtung move toward creating
- ein personalisiertes Operating Profile
- einen Starter Workspace
- eine Starter Conversation/Path in diesen Workspace

### Warum das wichtig ist
Das macht Onboarding Teil der Architecture, nicht nur Account Setup.

---

## Cost and Product Strategy Implications (Kosten- und Produktstrategie-Implikationen)

Dieses Model supportet auch eine wichtige Product Strategy Idee:

### Statt
ein default expensive "best" Mode für everyone,

### kann die Platform aim for
Profile-shaped Runtime Economics und Behavior.

Das erlaubt dem Product zu pursue:
- stärkere Alignment zwischen User Needs und System Behavior
- bessere Cost Discipline
- meaningfulere Differentiation an einem lower Price Point

Das ist ein serious Product Advantage wenn honestly implemented.

---

## Common Failure Modes (Häufige Failure Modes)

## 1. Workspace as Cosmetic Shell
Ein Workspace existiert in der UI aber beeinflusst nicht actually Runtime/Context Behavior.

## 2. Operating Profile as Empty Label
Ein Profile existiert in DB/UI aber formt nicht real Backend Behavior.

## 3. Conversation Re-Centralization
Das System fällt zurück Conversations als das real Primary Object zu behandeln, undermining das Workspace Model.

## 4. UI Promises Ahead of Backend Reality
Frontend exponiert Profile/Mode Controls die das Backend cannot yet honor faithfully.

## 5. Onboarding Without Runtime Structure
Users erscheinen "set up" aber haben nicht actually den Workspace/Profile State needed für die intended Architecture.

---

## Honest Product Framing (Ehrliches Product Framing)

Das Workspace/Operating-Profile Model sollte plainly beschrieben werden.

### Good Framing
- Workspaces organisieren active Context und future Memory Scope
- Operating Profiles helfen Backend Behavior zu formen
- Conversations leben inside that structure
- Runtime Behavior wird zunehmend von diesem Model server-side resolved

### Bad Framing
- "die KI wird automatisch was du willst überall instantly"
- "Profiles garantieren perfect Intelligence Mode Selection"
- "Workspace bedeutet Folder, aber auch alles andere somehow"

Precision builds Trust.

---

## Forward Direction

Dieses Model wird valuableer as der Rest der Platform matures:
- Server-side Runtime Routing
- Prepared Context Pipelines
- Memory-Native Behavior
- Graph/Retrieval Augmentation
- Workspace-scoped Persistence und Knowledge Behavior

Je mehr diese Systems real werden, desto wichtiger wird die Workspace/Operating-Profile Abstraction.

---

## Summary

Die Schlüssel-Idee ist diese:

**Workspace defines where the work lives. Operating profile helps define how the system should behave there. Conversation is the active thread inside that structure.**

Das ist eine der zentralen architektonischen Ideen in Genie AIs Evolution beyond a generic chatbot product.

---

## Related Docs

Dieses Dokument sollte neben gelesen werden:
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- `docs/architecture/memory-and-context-architecture.md`
- future Onboarding, API, und ADR Documentation