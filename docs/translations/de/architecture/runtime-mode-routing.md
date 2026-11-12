# Runtime-Modus-Routing

## Zweck

Dieses Dokument erklärt, wie Genie AI das Laufzeitverhalten für Conversation-Requests bestimmt.

Es existiert, weil die Plattform sich von einem simplen Client-kontrollierten Mode-Toggle-Modell wegbewegt und hin zu einem ehrlicheren, server-seitig aufgelösten Routing-Modell basierend auf Anwendungskontext.

Ziel dieses Dokuments ist es zu klären:
- wo der Runtime-Modus entschieden wird
- welcher Kontext diese Entscheidung beeinflusst
- wie Pre-Workspace- und Workspace-backed-Conversations sich unterscheiden
- wie man über Debugging und zukünftige Erweiterung nachdenkt

---

## Kernprinzip

Der Runtime-Modus sollte vom Server aufgelöst werden, nicht direkt von willkürlicher Client-Intention vertraut werden.

In praktischen Begriffen bedeutet das, dass das System zunehmend Runtime-Verhalten ableiten sollte aus:
- Conversation-Kontext
- Workspace-Kontext
- Operating-Profile-Kontext
- Backend-Routing-Logik

statt aus einem Frontend-Control, das behauptet, den finalen Modus direkt zu setzen.

---

## Warum Das Existiert

Früheres Produktverhalten konnte einen Mismatch erzeugen zwischen:
- was die UI als Modus behauptete
- was das Backend tatsächlich tat
- was der User vernünftigerweise erwarten sollte

Das ist besonders problematisch in einem System, das unterstützen will:
- budget-aware Verhalten
- workspace-aware Verhalten
- profile-aware Verhalten
- zukünftige memory-native Execution-Patterns

Ein server-seitig aufgelöstes Routing-Modell ist wahrheitsgetreuer und erweiterbarer.

---

## Hochlevel Runtime-Routing-Modell

Auf hoher Ebene fließt ein Conversation-Request durch diese Routing-Stufen:

1. Request betritt Chat API Layer
2. Server identifiziert Conversation-Kontext
3. Server identifiziert, ob ein Workspace involviert ist
4. Server löst Operating-Profile-Einfluss auf
5. Runtime-Modus wird server-seitig gemappt
6. Model/Provider-Verhalten wird entsprechend ausgewählt
7. Response wird mit optionaler Debug-Sichtbarkeit zurückgegeben

Das bedeutet: das Backend ist die finale Autorität über den effektiven Runtime-Modus.

---

## Wichtige Kontext-Quellen

## 1. Conversation-Kontext

Der Server muss zuerst verstehen, zu welcher Conversation der Request gehört.

### Warum es wichtig ist
Conversation-State kann bestimmen:
- ob ein Request Teil eines allgemeinen Chat-Flows ist
- ob er an einen Workspace-backed-Flow angehängt ist
- ob historische oder kontextuelle Routing-Regeln gelten sollten

---

## 2. Workspace-Kontext

Workspace-Kontext ist eine wichtige architektonische Routing-Eingabe.

### Warum es wichtig ist
Eine Workspace-backed-Conversation kann tragen:
- stärkeren organisatorischen Kontext
- unterschiedliche Memory-Erwartungen
- Profil-verknüpftes Runtime-Verhalten
- zukünftige Retrieval/Context-Unterschiede

Das ist einer der Gründe, warum die Plattform sich vom universellen Chat-Mode-Toggle-Modell wegbewegt.

---

## 3. Operating-Profile-Kontext

Operating Profiles sollen Runtime-Verhalten ehrlicher formen als ein generischer "schnell vs Qualität" UI-Switch.

### Warum es wichtig ist
Ein Operating Profile kann ausdrücken:
- erwartete Tiefe/Verhalten
- Cost/Latency-Tradeoffs
- zukünftige Präferenz-Strukturen
- Mode-Selektion-Logik aligned mit User/Workspace-Modell

Das macht Runtime-Routing zu einem Plattform-Verhalten, nicht nur einer UI-Präferenz.

---

## General vs. Workspace-Backed Conversations

## General / Pre-Workspace Verhalten

Bevor eine Conversation wirklich in einer Workspace/Profile-Struktur verankert ist, hat die Plattform sich zu einem vereinfachten und ehrlicheren Default-Verhalten bewegt.

### Praktisches Ergebnis
Der user-facing Pre-Workspace-Modus ist effektiv:
- **General**

### Warum
Das vermeidet vorzutäuschen, dass der User einen tiefen Backend-Modus wählt, wenn der server-seitige Kontext für solche Differenzierung noch nicht existiert.

---

## Workspace-Backed Verhalten

Sobald eine Conversation mit einem Workspace assoziiert ist und potenziell von einem Operating Profile beeinflusst wird, wird Routing kontext-sensitiver.

### Praktisches Ergebnis
Der effektive Modus kann abgeleitet werden aus:
- Workspace-State
- Operating-Profile-Signalen
- Backend-Mapping-Logik

Hier gehört die fortgeschrittenere Runtime-Architektur hin.

---

## Server-Seitige Auflösung

Die aktuelle architektonische Richtung ist, dass die Chat-Route Runtime-Modus server-seitig auflösen sollte.

### Warum das wichtig ist
Es stellt sicher dass:
- der effektive Modus zur tatsächlichen Backend-Logik passt
- UI-Vereinfachung Backend-Flexibilität nicht reduziert
- zukünftige Routing-Regeln evolvieren können ohne den User zu belügen
- Debugging sich auf eine autoritative Routing-Ebene fokussieren kann

---

## Beziehung zu UI-Controls

## Altes Mentalmodell
User tippt auf client-seitigen Mode-Switch und der Modus ist einfach das, was der Client sagt.

## Aktuelle Richtung
Der Client kann limitierten UX-State exponieren, aber das Backend bestimmt das effektive Runtime-Verhalten.

### Warum das wichtig ist
Das verhindert eine Klasse irreführender UX wo:
- UI ein Verhalten suggeriert
- Server stillschweigend etwas anderes tut

Eine kleinere, ehrlichere Client-Oberfläche ist besser als eine größere Fake-Control-Oberfläche.

---

## Debugging-Hilfen

Das System hat Debug-Headers genutzt um Runtime-Verhalten inspizierbarer zu machen.

### Bekannte Beispiele
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

### Warum diese helfen
Sie erlauben dem Team zu verifizieren:
- welchen Modus der Server tatsächlich auflöste
- welchen Model-Pfad gewählt wurde
- ob Runtime-Routing mit Erwartungen unter verschiedenen Conversation/Workspace-States aligniert

Diese Headers sind besonders nützlich beim Debuggen von Unterschieden zwischen:
- General-Conversation-Flows
- Workspace-backed-Conversation-Flows
- Profil-beeinflusstes Routing

---

## Aktuelle Architektonische Absicht

Runtime-Routing sollte zunehmend dieses Prinzip reflektieren:

> das System sollte Verhalten basierend auf Applikationskontext wählen, statt den User zu bitten, Backend-Routing manuell zu simulieren.

Das ist besser aligned mit der breiteren Plattform-Richtung zu:
- workspace-centric Verhalten
- operating-profile-abgeleiteter Runtime-Logik
- memory/context-aware Execution

---

## Häufige Failure-Modes

## 1. UI/Backend-Mismatch
Frontend präsentiert Mode-Label das nicht zum tatsächlichen Backend-Routing-Verhalten passt.

## 2. Context-Loss
Backend versäumt den richtigen Conversation/Workspace/Profile-Kontext zu recoveren, verursacht Fallback zu einem weniger spezifischen Modus als beabsichtigt.

## 3. Debug-Opacity
System löst Modus intern auf gibt aber zu wenig Visibility für Verifikation.

## 4. Overgrowth of Client Controls
Frontend akkumuliert zu viele Mode-Toggles bevor Backend-Kontext-Modell reif genug ist sie zu rechtfertigen.

---

## Warum "General" Wichtig Ist

Die Einführung eines einfacheren **General** Modus auf Pre-Workspace-Flows ist keine Regression.
Es ist eine Truthfulness-Verbesserung.

### Was es vermeidet
- fake Precision in der UI
- vorzeitige Exposition von Backend-Routing-Komplexität
- irreführende Versprechen über Control die das Backend noch nicht wirklich ehrt

### Was es ermöglicht
- sauberere Runtime-Architektur
- stärkere zukünftige Workspace/Profile-Routing
- einfacheres Debugging
- vertrauenswürdigere UX

---

## Forward Direction

Dieses Routing-Modell wird mächtiger wenn andere Systeme reifen, besonders:
- Operating Profile Design
- Memory/Context Preparation
- Workspace-First Application Flows
- Retrieval und Context-Layer Composition

Über Zeit kann Runtime-Mode-Routing zu einer reicheren Policy-Layer werden statt einfachem Mode-Switch.

---

## Empfohlene Verwandte Docs

Dieses Dokument sollte neben gelesen werden:
- `docs/architecture/system-architecture.md`
- `docs/security/public-routes.md`
- zukünftiges `docs/architecture/memory-and-context-architecture.md`
- zukünftige API/Runtime-Referenz-Docs

---

## Zusammenfassung

Die wichtigste Idee ist einfach:

**Genie AI sollte Runtime-Verhalten aus Kontext auf dem Server auflösen, nicht vortäuschen, dass der Client allein den finalen Modus kontrolliert.**

Das ist das Rückgrat einer ehrlicheren und erweiterbareren KI-Plattform-Architektur.