# Retrieval- und Graph-Strategie

## Zweck

Dieses Dokument erklärt die retrieval- und graph-orientierte architektonische Richtung in Genie AI.

Es existiert, weil die Context- und Memory-Richtung der Plattform nicht gut durch ein simples "we use RAG" Label beschrieben wird.

Das breitere architektonische Ziel ist spezifischer:
- Prepared Context statt Raw Transcript Stuffing
- Retrieval als structured Support Layer
- Zukünftige Graph-Aware Composition statt flat Nearest-Neighbor Thinking allein

Dieses Dokument beschreibt diese Richtung auf hoher Ebene.

---

## Kernprinzip

Retrieval sollte Context Assembly supporten, nicht Architecture ersetzen.

Mit anderen Worten:
- Retrieval ist nicht das ganze Memory System
- Embeddings sind nicht der ganze Intelligence Layer
- Graph Structure ist nicht valuable unless sie Relevanz, Boundaries oder Explainability verbessert

Der Punkt ist, zu verbessern wie Context ausgewählt und komponiert wird.

---

## Warum "Just Use RAG" Nicht Genug Ist

Die Phrase "RAG" ist oft zu vague um architektonisch useful zu sein.

Sie kann in der Praxis sehr verschiedene Dinge bedeuten:
- Retrieved Chunks in Prompts stopfen
- Semantic Search über Documents
- Tool-Augmented Retrieval Flows
- Hybrid Retrieval Pipelines
- Memory Systems mit schwacher Structure

Für Genie AI ist die wichtigere Frage:

**welche Rolle sollte Retrieval in einer workspace-centric, context-prepared Architecture spielen?**

---

## Retrieval als Support Layer

Die intended Direction ist, dass Retrieval helfen sollte Fragen zu beantworten wie:
- was für Supporting Material ist jetzt relevant?
- was für Workspace-linked Information sollte diesen Run beeinflussen?
- was für Context sollte elevated werden ohne den Prompt zu bloaten?

Das macht Retrieval zu einem Context-Selection Mechanism, nicht ein End in sich.

---

## Relationship to Prepared Context (Beziehung zu Prepared Context)

Prepared Context ist das zentrale architektonische Pattern.

Retrieval und Graph-Aware Systems sollten in dieses Pattern pluggen indem sie beitragen:
- relevantes Support Material
- structured Relationship Context
- bounded Memory Cues

Sie sollten nicht einfach große Mengen semantisch related Text in das Model dumpen und das Architecture nennen.

---

## Workspace-Scoped Retrieval

Ein Workspace-First Produkt braucht Retrieval das Scope respektiert.

### Warum das wichtig ist
Ohne Workspace Boundaries kann Retrieval werden:
- too broad
- too noisy
- too leaky
- too hard to trust

### Intended Direction
Retrieval sollte zunehmend in der Lage sein innerhalb meaningful Scope zu operieren, wie:
- Workspace Boundaries
- Project Boundaries
- User-specific Context Boundaries

Das ist viel mehr aligned mit dem Product als generic Global Semantic Lookup.

---

## Graph Direction

Codebase und umgebendes Planning haben auf Graph-First oder Graph-Augmented Thinking hingewiesen.

### What that suggests (Was das suggeriert)
Statt alle Supporting Information als isolated Chunks zu behandeln, kann die Platform eventualmente representieren und nutzen:
- Relationships zwischen Concepts
- Related Entities oder Artifacts
- Structured Support Links
- Graph-Aware Relevance Composition

### Warum das attractive ist
Eine Graph-Aware Direction kann verbessern:
- Relevance Precision
- Compositional Context
- Traceability von related Material
- Future Memory Organization

---

## Graph as Structure, Not Hype (Graph als Structure, Nicht Hype)

Graph Direction sollte carefully documented werden.

### Good Framing
- eine Way Relationships zwischen relevanten Objects und Ideas zu representieren
- eine Support Structure für Retrieval/Context Composition
- ein possible Path zu besserer Memory Organization

### Bad Framing
- "der Graph löst Intelligence"
- "Graph bedeutet wir brauchen keine Context Selection Discipline mehr"
- "Graph Retrieval ist automatically superior in every case"

Graph only matters wenn es das System more useful und more understandable macht.

---

## Hybrid Retrieval Direction

Eine mature Version dieser Architecture kann eventualmente multiple Retrieval/Logical Surfaces kombinieren wie:
- Semantic Retrieval
- Workspace-Scoped Selection
- Graph-Aware Relatedness
- Policy-Based Context Inclusion
- Future Profile-Aware Retrieval Weighting

Das ist eine realistischere Direction als zu pretend dass ein Vector Search Pass die finale Architecture ist.

---

## Boundary Importance (Grenzen Wichtigkeit)

Retrieval Strategy muss die gleiche Boundary Discipline respektieren wie der Rest der Platform.

### Important Boundaries
- Workspace vs Global Scope
- Public vs Private Material
- Active Conversation Context vs Durable Retrieved Context
- Immediate Relevance vs Archival Presence

Ohne diese Boundaries wird Retrieval harder to trust und easier to misuse.

---

## Risks and Failure Modes (Risiken und Failure Modes)

## 1. Flat Chunk Spam
Zu viel Retrieved Text enters Model ohne genug Selection Discipline.

## 2. Weak Scope Control
Relevantes Material wird vom falschen Workspace oder falschen Context Boundary retrieved.

## 3. Semantic Nearness Without Practical Relevance
Retriever returns Content das technisch similar aber operationally unhelpful ist.

## 4. Overclaiming Graph Maturity
System wird als Graph-Native beschrieben bevor der reale Graph-Backed Runtime Path stable ist.

## 5. Architecture by Buzzword
Retrieval, Memory, und Graph Language werden ohne klare Boundaries oder actual System Roles verwendet.

---

## Forward Direction

Die wahrscheinliche starke Direction für Genie AI ist:
- Workspace-Scoped Retrieval
- Prepared Context Assembly
- Stärkere Server-Side Context Selection
- Future Graph-Aware Support Composition
- Memory treated as structured Product Primitive

Das ist eine präzisere und glaubwürdigere Direction als generic "RAG-powered AI" Framing.

---

## Summary

Die Schlüssel-Idee ist diese:

**Retrieval und Graph Strategie sollten existieren um structured Context Assembly in einem workspace-centric System zu verbessern, nicht um Architecture mit Buzzwords zu ersetzen.**

---

## Related Docs

Dieses Dokument sollte neben gelesen werden:
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/workspace-operating-profile-model.md`
- `docs/architecture/runtime-mode-routing.md`
- Future Retrieval Implementation und API Reference Docs