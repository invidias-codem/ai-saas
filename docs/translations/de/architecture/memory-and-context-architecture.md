# Memory- und Context-Architektur

## Zweck

Dieses Dokument erklärt, wie Genie AI seine Memory- und Context-Architektur weiterentwickelt.

Es existiert, um eine zentrale Produkt-Richtung explizit zu machen:
Genie AI ist nicht dazu gedacht, ein dünner Chat-Wrapper um rohe Rolling History zu bleiben. Es bewegt sich hin zu einer strukturierteren, workspace-bewussten, Prepared-Context-Architektur mit stärkeren Grenzen zwischen Conversation-State, Workspace-State, Retrieved Context und zukünftigen Memory-Systemen.

Dieses Dokument fokussiert auf architektonische Absicht, aktuelle Patterns und Design-Richtung, statt zu behaupten, dass jedes zukünftige Subsystem bereits vollständig realisiert ist.

---

## Kernprinzip

Context sollte **prepared** sein, nicht bloß accumulated.

Das bedeutet, das System sollte zunehmend vermeiden, "alles in der History" als einzige oder beste Quelle für Model Context zu behandeln.

Stattdessen sollte Context aus mehreren Layers assembled werden wie:
- immediate Conversation State
- Workspace Context
- Operating Profile Context
- retrieved supporting information
- zukünftige Memory Layers

Diese Architektur ist kontrollierbarer, erweiterbarer und ehrlicher darüber, was das System tatsächlich nutzt.

---

## Warum Das Wichtig Ist

Eine naive Chat-Architektur tendiert dazu, in eines von zwei Patterns zu degradieren:

1. **Raw Transcript Stuffing**
   - zu viel irrelevante History
   - unklare Relevanz
   - Context-Window-Verschwendung
   - schwächere Prompt-Disziplin

2. **Opaque Hidden Retrieval Behavior**
   - User und Entwickler können nicht sagen, welche Information die Antwort beeinflusste
   - Debugging wird schwierig
   - Architektur wird fragil und magisch

Prepared Context soll einen besseren Mittelweg bieten.

---

## Architektonische Context-Layer

Auf hoher Ebene sollte Genie AIs Context-Architektur als mehrere kooperierende Layer verstanden werden.

## 1. Immediate Conversation Context

Das ist der kurzfristige Interaction State direkt assoziiert mit der aktiven Conversation.

### Typische Inhalte
- kürzliche User/Assistant Turns
- aktiver Prompt/Interaction State
- sofortiges Request Framing

### Rolle
Dies bietet lokale Conversational Coherence.

### Limitation
Immediate Conversation Context allein reicht nicht für ein workspace-centric, memory-aware Produkt.

---

## 2. Workspace Context

Workspace Context ist ein major architektonischer Layer, weil das Produkt zu workspace-first Verhalten bewegt.

### Typische Inhalte
- Workspace Identity
- Workspace-linked Conversation Scope
- relevanter persistenter organisationaler Context
- zukünftige Workspace Memory Boundaries

### Rolle
Workspace Context erlaubt dem System, sich so zu verhalten, als gehöre eine Conversation zu einem meaningful Container statt zu einem isolierten free-floating Thread.

### Warum es wichtig ist
Das ist einer der Kernunterschiede zwischen einem generischen Chatbot und einem strukturierteren Intelligence Workspace.

---

## 3. Operating Profile Context

Operating Profiles sollen Runtime-Verhalten formen und zunehmend auch Context-Verhalten.

### Potenzieller Einfluss
Ein Operating Profile kann beeinflussen:
- Style von System-Verhalten
- erwartete Tiefe
- Runtime Tradeoffs
- zukünftige Context-Selection Policies

### Architektonische Rolle
Operating Profiles helfen, Context-Architektur an das breitere Plattform-Modell zu binden, statt Memory/Context als disconnected Subsystem zu lassen.

---

## 4. Retrieved Supporting Context

Die System-Richtung umfasst das Retrieven von Supporting Information statt nur auf Conversation Transcripts zu vertrauen.

### Potenzielle Quellen
- kuratierte Memory Layers
- zukünftige Graph-Aware Retrieval
- strukturierte Workspace Materials
- extern ingested Knowledge in bounded Contexts

### Rolle
Retrieved Context sollte Relevanz liefern, nicht indiscriminate Bulk.

### Wichtiger Hinweis
Retrieved Context muss prepared und carefully bounded sein. Retrieval hilft nur wenn es Relevanz und Traceability verbessert statt Prompt Noise hinzuzufügen.

---

## 5. Future Durable Memory Layers

Die Architektur-Richtung zeigt klar zu dauerhafteren Memory-Konzepten, aber sie sollten sorgfältig beschrieben werden.

### Memory sollte nicht als einzelner Blob behandelt werden
Ein nützliches zukünftiges Memory-System wird wahrscheinlich mehrere Memory-Klassen involvieren, wie:
- short-horizon active context
- workspace-linked durable context
- structured recall surfaces
- zukünftige Graph oder Retrieval-Enhanced Memory

### Warum das wichtig ist
Alles "Memory" zu nennen ohne Distinctions macht das System schwerer zu reason about und leichter zu misrepresentieren.

---

## Prepared Context als Central Pattern

Die Prepared-Context-Idee ist einer der wichtigsten architektonischen Patterns in Genie AI.

### Was es bedeutet
Statt Raw State as-is durchzureichen, prepared das System ein Context Package für Model Execution.

### Ein Prepared Context kann beinhalten
- selektierte Conversation History
- explizite Prompt Sections
- workspace-derived Framing
- retrieved Supporting Material
- System Instructions organized by Purpose

### Warum das besser ist
Es ermöglicht:
- sauberere Prompt Construction
- intentionalere Relevanz
- einfacheres Debugging
- zukünftige Policy Control darüber was in Model Context eingeht
- reduzierte Abhängigkeit von Transcript Bloat

---

## Beziehung zu Memory-Native Direction

Die Produkt-Richtung hat zunehmend Memory-Native Architecture betont.

Das sollte sorgfältig interpretiert werden.

### Es bedeutet NICHT einfach
- "wir speichern viel Text"
- "wir haben Embeddings irgendwo"
- "der Assistant erinnert sich an alles magisch"

### Es SOLLTE bedeuten
- Memory wird als Product Primitive behandelt
- Context Assembly hat explizite Architektur
- Workspace und Runtime Verhalten können aus mehr als raw Chat Log ziehen
- System ist designed für Structured Recall und zukünftige Evolution

Das ist eine stärkere und glaubwürdigere Interpretation.

---

## Graph und Retrieval Direction

Codebase und umgebendes Planning haben auf Graph-First oder Graph-Augmented Retrieval Ideen hingewiesen.

### Warum das wichtig ist
Eine Graph-Aware Direction suggests das System eventuell Relationships zwischen Concepts, Materials und Workspace Objects als First-Class Retrieval Structure behandeln könnte statt nur auf Flat Nearest-Neighbor Lookup zu vertrauen.

### Architektonische Implikation
Wenn diese Direction reift, könnte Memory/Context Assembly zunehmend involvieren:
- Relevance Selection
- Relationship-Aware Context Composition
- Structured Support statt Raw Passage Dumping

### Vorsicht
Das sollte als Direction dokumentiert werden, unless und until der volle Production Path implemented und stabilized ist.

---

## Boundaries Matter (Grenzen Sind Wichtig)

Einer der wichtigsten Teile eines ernsthaften Memory/Context Systems ist Boundary Discipline.

### Boundaries die matter
- Conversation vs Workspace Context
- User-visible History vs Hidden Support Context
- Temporary Context vs Durable Memory
- Public Data vs Protected Internal State
- Retrieved Assistance vs System-Owned Instructions

Ohne diese Boundaries wird das System schwerer zu vertrauen und schwerer zu debuggen.

---

## Debuggability and Transparency (Debugbarkeit und Transparenz)

Eine Memory/Context Architektur ist nur nützlich wenn sie inspiziert und reasoned about werden kann.

### Gute architektonische Properties
- Entwickler können erklären welche Context-Arten assembled werden
- Runtime Verhalten kann gedebuggt werden wenn Retrieval/Context Selection sich falsch anfühlt
- System Verhalten wird nicht als mystical Total Recall geframed

### Warum das wichtig ist
User und Entwickler sollten nicht raten müssen ob eine Antwort kam von:
- recent Turns
- Workspace Framing
- Retrieved Support Data
- Hidden Durable Memory

Auch wenn nicht jedes interne Detail in UI exposed ist, muss die Architektur intern understandable bleiben.

---

## Common Failure Modes (Häufige Failure Modes)

## 1. Transcript Bloat
Zu viel Raw History enters Prompt ohne useful Selection.

## 2. Weak Relevance Selection
Retrieved Material ist technisch related aber nicht actually useful.

## 3. Hidden Context Confusion
System verwendet Background Context das schwer zu erklären oder trace ist.

## 4. Boundary Collapse
Workspace Context, Conversation Context und Durable Memory werden interchangeably behandelt.

## 5. Overclaiming Memory
Produkt präsentiert Impression von stärkerem persistentem Understanding als das tatsächliche System reliably supports.

---

## Honest Product Framing (Ehrliches Product Framing)

Eine transparente Memory/Context Architektur sollte vage Claims vermeiden wie:
- "die KI erinnert sich an alles"
- "die KI versteht deine Welt wirklich"

Ein ehrlicheres Framing ist:
- Plattform prepares Context aus mehreren relevanten Layers
- Workspaces und Profiles helfen Scope Behavior
- Memory und Retrieval werden als Teil der Product Architektur structured
- Context wird intentionally assembled statt nur auf Raw Transcript Growth zu vertrauen

Dieser Erklärungs-Style baut mehr Trust als inflated Language.

---

## Beziehung zu Runtime Mode Routing

Memory/Context Architektur und Runtime Mode Routing sind closely related.

### Warum
Verschiedene Runtime Behaviors können zunehmend abhängen von:
- wie viel Context assembled wird
- welche Layers included sind
- wie Workspace/Profile Logic Selection beeinflusst

Deshalb kann Memory/Context nicht als separiert vom Rest der System Architektur behandelt werden.

---

## Forward Direction

Der wahrscheinliche Evolution Path für Genie AIs Context Architektur umfasst:
- stärkere Prepared-Context Pipelines
- reicheres Workspace-scoped Memory Verhalten
- bessere Server-Side Control über Context Selection
- zukünftige Graph/Retrieval Augmentation
- verbesserte Transparenz und Debuggability

Das Ziel ist nicht maximale hidden Complexity.
Das Ziel ist **bessere Relevanz, stärkere Structure, und wahrhaftigeres System Verhalten**.

---

## Summary

Die Schlüssel-Idee ist diese:

**Genie AI sollte Context aus structured Layers assemblieren statt vorzutäuschen, dass raw Chat History allein ein sufficient Memory System ist.**

Das ist die Foundation einer ernsteren Memory-Native Plattform Architektur.

---

## Recommended Related Docs

Dieses Dokument sollte neben gelesen werden:
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- zukünftige Docs über Retrieval, API Verhalten, und Trust Boundaries