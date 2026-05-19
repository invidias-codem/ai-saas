# Gemini File Search Routing Policy for Lattice

## Purpose
This note turns the Gemini File Search translation memo into a more implementation-facing routing policy artifact.

The goal is to define when Lattice OS should use Gemini File Search as a retrieval lane, when it should not, and how its outputs should be treated relative to Lattice-owned memory and graph state.

## Core Policy Statement
Gemini File Search should be treated as a **managed multimodal grounding lane** inside Lattice OS.

It is not the default memory substrate.
It is not the source of durable truth by itself.
It is a tool for retrieving evidence from uploaded file/media corpora when the task benefits from:
- multimodal grounding
- citation-rich retrieval
- hosted frontier document/image search

## Architectural Role

### Lattice-native layers remain primary for:
- durable workspace memory
- user memory
- memory scope enforcement
- workspace SOP / doctrine
- graph/world-model continuity
- long-lived operational state

### Gemini File Search becomes a selective lane for:
- file-heavy retrieval
- image-aware retrieval
- citation-heavy retrieval
- grounded extraction from uploaded corpora

### UCOL’s job
UCOL should decide whether Gemini File Search is:
- unnecessary
- useful as a secondary retrieval lane
- required as the dominant grounding lane for the current task

---

## Default Policy

## Default rule
Do **not** invoke Gemini File Search by default for all requests.

### Default retrieval order
For ordinary workspace tasks, prefer:
1. Lattice-native memory retrieval
2. graph/world-model/contextual workspace doctrine
3. only then hosted file search if the task specifically needs file/media grounding

### Why
This preserves:
- lower cost
- lower latency
- stronger scope control
- inspectable owned memory
- less provider lock-in

---

## Positive Routing Conditions
Use Gemini File Search when one or more of the following is true.

## Condition A — The task is explicitly file-centric
Examples:
- “What does the manual say about OAuth rotation?”
- “Find the page with the architecture diagram.”
- “Which product image matches the red running shoe?”

### Policy
If the user request clearly depends on uploaded files or images, File Search becomes a strong candidate lane.

---

## Condition B — Multimodal evidence matters
Examples:
- image catalogs
- charts
- diagrams
- screenshots
- scanned forms
- PDF documents with embedded visuals

### Policy
If semantic retrieval depends on visual content rather than text alone, prefer Gemini File Search over text-only memory retrieval.

---

## Condition C — Grounding and citations are important
Examples:
- enterprise knowledge workflows
- support answers needing document/page citations
- research summaries needing traceable source references
- insurance/claims or operational reviews

### Policy
If the answer must be explicitly traceable to file/page/media evidence, strongly prefer a File Search lane.

---

## Condition D — Hosted frontier fallback is needed
Examples:
- local/self-hosted multimodal retrieval is unavailable or degraded
- Lattice-native retrieval returns weak/insufficient results for a file-heavy query
- the workspace explicitly opts into hosted file grounding

### Policy
File Search can be used as a fallback or escalation lane when local or native retrieval is weak for the current evidence type.

---

## Condition E — Structured grounded extraction is the task
Examples:
- extract product matches from a catalog
- extract grounded claims from a technical PDF
- retrieve image-backed support evidence
- generate grounded structured records from uploaded files

### Policy
If the task is not merely question-answering but structured extraction over a file corpus, File Search is a good lane candidate.

---

## Negative Routing Conditions
Avoid Gemini File Search when one or more of the following is true.

## Condition N1 — The task is ordinary conversational continuity
Examples:
- recalling prior workspace discussions
- retrieving prior facts or preferences
- operating-profile-aware conversational responses
- memory-native planning not tied to uploaded file corpora

### Policy
Use Lattice-native memory/graph/context layers instead.

---

## Condition N2 — The task is doctrine / SOP / workspace policy retrieval
Examples:
- current workspace instructions
- operating profile behavior
- memory scope rules
- transition protocol state

### Policy
Prefer Lattice-owned durable workspace memory and doctrine artifacts.
Do not outsource core operational rules to hosted file search unless the doctrine itself is intentionally stored there and treated as a source document.

---

## Condition N3 — The task requires durable truth updates
Examples:
- store a learned fact
- update workspace memory
- promote or partition memory
- reinforce operational state

### Policy
File Search can provide evidence, but durable writeback must happen through Lattice-native memory/graph policy.

---

## Condition N4 — Scope/ownership sensitivity is high
Examples:
- privacy-sensitive workspace state
- data not approved for hosted external retrieval
- environments requiring strict local/owned retrieval policy

### Policy
Prefer Lattice-native retrieval or disable the File Search lane entirely for the workspace or task class.

---

## Routing Output Model
When UCOL evaluates Gemini File Search, it should make an explicit routing decision such as:
- `none`
- `secondary_evidence_lane`
- `primary_grounding_lane`

### Interpretation
- `none` = do not use File Search
- `secondary_evidence_lane` = use native memory first, then enrich with File Search if needed
- `primary_grounding_lane` = the task should be grounded primarily in the uploaded file/media corpus

---

## Proposed Decision Inputs
A future routing policy implementation can score File Search relevance from signals like:

### Request signals
- mentions of files, docs, pages, screenshots, manuals, diagrams, images, catalogs
- explicit request for citations / references / page numbers
- structured extraction wording

### Workspace signals
- workspace has connected file corpus
- workspace has multimodal ingestion enabled
- workspace allows hosted retrieval
- workspace class is research / support / catalog / claims / documentation-heavy

### Retrieval signals
- native memory recall confidence is low
- graph/context lane lacks sufficient evidence
- file corpus likely contains answer-bearing evidence

### Policy signals
- hosted frontier retrieval allowed
- latency/cost profile acceptable
- privacy policy allows use of hosted lane

---

## Output Handling Policy
Using File Search should not automatically create durable memory.

### File Search outputs should first be treated as:
- current-task evidence
- grounded answer support
- structured extraction candidates

### Durable writeback should require policy
Only after evaluation should Lattice decide whether to write back:
- distilled facts
- structured outcomes
- citation references
- graph nodes/links
- workspace summaries

### Why
This prevents “every retrieved file chunk” from becoming noisy long-term memory.

---

## Citation Capture Policy
When File Search is used, Lattice should preserve enough source structure for later trust/debugging.

### Prefer capturing
- file/store identifier
- cited document title
- cited page number
- media id if image citation exists
- answer segment ↔ source mapping where feasible

### Reason
This aligns with:
- trust
- auditability
- support/research workflow verification
- future evidence-aware memory policies

---

## Writeback Policy
After a File Search-grounded answer, Lattice can optionally persist:
- distilled fact summaries
- extracted structured entities
- resolution summaries
- workspace-relevant SOP changes

### But should not persist blindly
Do not store:
- raw retrieved chunks by default
- all media blobs or full file copies as memory rows
- every grounded answer as durable truth

### Better rule
Store the **distilled operationally useful result**, plus citations/metadata where helpful.

---

## Recommended Initial Implementation Pattern
For an early practical implementation, use this pattern:

### Step 1
Run normal Lattice-native memory/graph/prepared-context retrieval.

### Step 2
Evaluate whether file-centric or multimodal grounding is strongly indicated.

### Step 3
If yes, invoke Gemini File Search as:
- a secondary evidence lane
or
- the primary grounding lane

### Step 4
Generate answer or structured output using grounded evidence.

### Step 5
If the result yields durable learning, write back the distilled memory into Lattice-native memory/graph layers.

This keeps the lane modular and policy-driven.

---

## High-Value Initial Use Cases

## 1. Support knowledge workspaces
- product manuals
- screenshots
- prior support memory
- citations to exact docs/pages

## 2. Research workspaces
- papers
- diagrams
- charts
- grounded summaries with evidence

## 3. Product catalog workflows
- images + PDFs + specs
- visually grounded retrieval
- structured product matching

## 4. Enterprise automation workflows
- file-backed Zapier steps
- document-grounded extraction
- memory writeback into workspace continuity

---

## Policy Summary

### Use Gemini File Search when:
- the task is file-centric
- multimodal evidence matters
- grounded citations are important
- native retrieval is insufficient for the file/media evidence class
- hosted retrieval is allowed by workspace policy

### Avoid Gemini File Search when:
- the task is ordinary conversational continuity
- the task is workspace doctrine/policy retrieval
- the task is primarily about durable memory updates
- the task is too sensitive for hosted retrieval

### Always remember:
Gemini File Search provides **evidence retrieval**.
Lattice OS remains the **persistent intelligence system** that decides:
- when to use that evidence
- how to combine it with memory and graph state
- what is worth writing back durably

## Bottom Line
The routing policy should make Gemini File Search a first-class but selective tool in Lattice OS.

It should be:
- available
- multimodal
- citation-aware
- policy-bounded
- non-default

That preserves the product’s memory-native architecture while adding a powerful frontier retrieval lane for file- and media-heavy work.

## Related Pages
- [gemini-file-search-to-lattice-os-translation](gemini-file-search-to-lattice-os-translation.md)
- [lattice-os-architecture-memo-2026-05](lattice-os-architecture-memo-2026-05.md)
- [ucol-request-routing-contract](ucol-request-routing-contract.md)
- [memory-scope-contract-and-enforcement](memory-scope-contract-and-enforcement.md)
