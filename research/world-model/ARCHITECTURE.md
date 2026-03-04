# Tech Genie — World Model Architecture
**Status:** Planning  
**Author:** JKlaw (AI co-founder)  
**Date:** 2026-03-04  
**Inspired by:** Yann LeCun's "A Path Towards Autonomous Machine Intelligence" (2022)

---

## Vision

Transform Tech Genie from an AI assistant wrapper into a **World Model** — a persistent, causal, self-auditing system that grounds AI outputs against a continuously updated model of reality.

The core thesis: LLMs predict tokens. A world model predicts *consequences*. The difference is the difference between a parrot and a mind.

---

## The Problem We're Solving

### Why LLMs Hallucinate (Root Cause Analysis)

1. **Base case flaw**: `IF unknown → accept user's framing as true`  
   The training objective optimizes for plausible next tokens, not grounded truth.

2. **Speaker/pronoun collapse**: No stable disambiguation of who said what, when, and why.  
   Intent and meaning become misattributable. Delta assessment becomes impossible.

3. **No delta measurement**: Without a fixed reference state, you can't measure the gap between  
   design (intended output) and outcome (actual output).

4. **No audit trail**: Errors can't be tracked, QC'd, or learned from.

5. **Root cause of all four**: **No object permanence.**  
   Entities, facts, and state don't persist across sessions. Every conversation starts in a world  
   that was just born. The model cannot be held accountable to a reality that doesn't survive  
   the context window.

**The Pythagorean comma analogy**: Just as stacking pure 3:2 fifths creates a cumulative gap  
(the Pythagorean comma) that concentrates into a catastrophic "wolf interval" at G#, LLMs  
accumulate small epistemic errors that concentrate into confident, catastrophic hallucinations  
at the edges of their training data. Equal temperament fixes the comma by distributing error  
evenly. A world model fixes the LLM by grounding it against a persistent truth layer.

---

## LeCun's World Model — Mapped to Tech Genie

| LeCun Module | Function | Tech Genie Status |
|---|---|---|
| **Perception** | Encodes current world state from inputs | ✅ Conversation engine |
| **Short-term Memory** | Active context + session state | ✅ Context window + session memory |
| **Long-term Memory** | Persistent representations across time | ✅ Knowledge graph (partial) |
| **Actor** | Proposes actions to achieve goals | ✅ UCOL router (partial) |
| **World Model** | Predicts world state after an action | ❌ Not built |
| **Cost Module** | Measures distance from goal / truth delta | ❌ Not built |

**We are 2 of 6 (with partial credit on 2 more). The two missing pieces define the difference  
between a smart assistant and a world model.**

---

## Architecture: Six Phases

---

### Phase 1 — Temporal World State Graph

**Current state**: The knowledge graph stores facts as static nodes and edges.  
**Target state**: Every entity has a full temporal history. The graph is a *timeline*, not a snapshot.

#### Schema Changes

```sql
-- Upgrade nodes to carry temporal + provenance metadata
ALTER TABLE knowledge_nodes ADD COLUMN valid_from     TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE knowledge_nodes ADD COLUMN valid_until    TIMESTAMPTZ;             -- NULL = still true
ALTER TABLE knowledge_nodes ADD COLUMN confidence     FLOAT DEFAULT 1.0;       -- 0.0 - 1.0
ALTER TABLE knowledge_nodes ADD COLUMN source_type    TEXT;                    -- 'user', 'verified', 'inferred', 'external'
ALTER TABLE knowledge_nodes ADD COLUMN source_url     TEXT;
ALTER TABLE knowledge_nodes ADD COLUMN superseded_by  UUID REFERENCES knowledge_nodes(id);

-- Typed, causal edges
ALTER TABLE knowledge_edges ADD COLUMN relationship_type TEXT NOT NULL DEFAULT 'RELATES_TO';
-- Valid types: CORRELATES_WITH | PRECEDES | CAUSES | CONTRADICTS | SUPPORTS | COUNTERFACTUAL_OF | ASSERTED_BY | IS_A | HAS_ATTRIBUTE

ALTER TABLE knowledge_edges ADD COLUMN valid_from     TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE knowledge_edges ADD COLUMN valid_until    TIMESTAMPTZ;
ALTER TABLE knowledge_edges ADD COLUMN confidence     FLOAT DEFAULT 1.0;
ALTER TABLE knowledge_edges ADD COLUMN causal_strength FLOAT;                 -- for CAUSES edges: 0.0 - 1.0

-- World state snapshots (point-in-time captures)
CREATE TABLE world_state_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at   TIMESTAMPTZ DEFAULT NOW(),
  entity_id     UUID REFERENCES knowledge_nodes(id),
  attribute     TEXT NOT NULL,
  value         JSONB NOT NULL,
  previous_value JSONB,
  changed_by    TEXT,           -- 'system', 'user_id', 'external_feed'
  source        TEXT
);
```

#### What This Enables
- Ask: *"What did we know about X on Feb 15th?"* → replay world state at any timestamp
- Detect when a fact changed and what caused it
- Object permanence: entities persist across sessions with full history

---

### Phase 2 — Causal Edge System

**Current state**: Edges represent co-occurrence or loose relationships.  
**Target state**: Edges carry causal direction, strength, and temporal order.

#### Relationship Type Taxonomy

```typescript
export type RelationshipType =
  | 'CORRELATES_WITH'    // weak association, no direction
  | 'PRECEDES'           // A happened before B (temporal, not necessarily causal)
  | 'CAUSES'             // A directly causes B (directional, requires evidence)
  | 'INHIBITS'           // A prevents or reduces B
  | 'CONTRADICTS'        // A and B cannot both be true
  | 'SUPPORTS'           // A is evidence for B
  | 'COUNTERFACTUAL_OF'  // "if not A, then not B"
  | 'IS_A'               // taxonomy / type hierarchy
  | 'HAS_ATTRIBUTE'      // entity → property
  | 'ASSERTED_BY'        // claim → speaker (solves attribution collapse)
  | 'CONTEXT_OF'         // claim was made in this context
  | 'SUPERSEDES'         // newer fact replaces older
```

#### Causal Chain Queries

```typescript
// Example: "What caused churn to spike in February?"
const causalChain = await graphStore.traceCausality({
  target: 'churn_spike_feb_2026',
  maxDepth: 4,
  edgeTypes: ['CAUSES', 'PRECEDES', 'CORRELATES_WITH'],
  timeRange: { from: '2026-01-01', to: '2026-03-01' }
});
```

---

### Phase 3 — The Cost Module (Delta Engine / Truth QC Layer)

**This is the audit engine.** Every AI output gets scored against the world state.

#### How It Works

```
AI Output → Claim Extractor → Graph Lookup → Delta Score → Audit Log
```

#### Claim Verdicts

```typescript
export type ClaimVerdict =
  | 'CONFIRMED'      // claim matches a high-confidence graph edge
  | 'SUPPORTED'      // claim is consistent with graph but not directly confirmed
  | 'UNVERIFIED'     // graph has no data on this claim (not false, just unknown)
  | 'CONTRADICTED'   // claim directly conflicts with a graph edge
  | 'MISATTRIBUTED'  // claim is true but attributed to wrong entity/speaker
  | 'OUTDATED'       // claim was true at time T but world state has since changed
```

#### Schema

```sql
CREATE TABLE ai_output_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  session_id      TEXT,
  model           TEXT NOT NULL,          -- 'gemini-flash', 'claude-sonnet', etc.
  claim_text      TEXT NOT NULL,
  claim_embedding VECTOR(1536),
  verdict         TEXT NOT NULL,
  confidence      FLOAT,
  graph_edge_id   UUID REFERENCES knowledge_edges(id),
  contradicts_node UUID REFERENCES knowledge_nodes(id),
  delta_score     FLOAT,                  -- 0 = perfect, 1 = complete fabrication
  domain          TEXT                    -- 'code', 'current_events', 'product', etc.
);

-- Per-model truth scores by domain (materialized view)
CREATE MATERIALIZED VIEW model_truth_scores AS
SELECT
  model,
  domain,
  COUNT(*) AS total_claims,
  AVG(CASE WHEN verdict = 'CONFIRMED' THEN 1.0 ELSE 0.0 END) AS confirmed_rate,
  AVG(CASE WHEN verdict = 'CONTRADICTED' THEN 1.0 ELSE 0.0 END) AS hallucination_rate,
  AVG(delta_score) AS avg_delta
FROM ai_output_audit
GROUP BY model, domain;
```

#### UCOL Integration

The router uses `model_truth_scores` to make smarter routing decisions:

```typescript
// Route to highest-accuracy model for this domain
const bestModel = await ucol.routeByTruthScore({
  domain: classifyQuery(query),
  minConfirmedRate: 0.85,
  fallback: 'gemini-flash'
});
```

---

### Phase 4 — The Simulation Layer (Predictive World Model)

**This is LeCun's core insight.** A world model doesn't just answer — it **simulates before answering.**

#### Architecture

```
User Query
    ↓
Intent Classifier (what is the user trying to achieve?)
    ↓
World State Loader (current state of relevant entities)
    ↓
Simulation Engine (if action A, predict state S')
    ↓
Cost Evaluator (which action gets closest to goal?)
    ↓
Response Generator (explain the recommended action + the simulation that supports it)
```

#### Example: Business Decision Simulation

```typescript
interface WorldModelSimulation {
  currentState: WorldStateSnapshot;
  proposedAction: string;
  predictedStates: Array<{
    probability: number;
    state: WorldStateSnapshot;
    causalChain: CausalEdge[];
    timeHorizon: string;
  }>;
  costScore: number;          // how far each outcome is from the goal
  recommendation: string;
  confidence: number;
}

// Usage
const sim = await worldModel.simulate({
  currentState: await worldState.capture('tech_genie'),
  action: 'increase_pricing_from_29_to_49',
  goal: 'maximize_monthly_revenue',
  horizons: ['30d', '90d', '180d']
});
```

#### What the Graph Needs to Support This

- Historical patterns from similar entities (SaaS pricing data, churn curves)
- Causal edges from past actions to outcomes
- Counterfactual nodes from prior decisions

---

### Phase 5 — Real-World Grounding (Live Signal Feeds)

LeCun's biggest critique: LLMs train on dead text. A world model needs **live signal.**

#### Data Sources → Graph State Updates

```typescript
interface GroundingFeed {
  name: string;
  endpoint: string;
  updateInterval: number;     // ms
  entityExtractor: (data: unknown) => KnowledgeNode[];
  edgeExtractor: (data: unknown) => KnowledgeEdge[];
  confidenceScore: number;    // how much to trust this source
}

const feeds: GroundingFeed[] = [
  {
    name: 'tech_genie_product_metrics',
    endpoint: '/api/internal/metrics',
    updateInterval: 3_600_000,   // hourly
    entityExtractor: extractProductMetrics,
    edgeExtractor: extractMetricCausality,
    confidenceScore: 1.0          // first-party data = max confidence
  },
  {
    name: 'github_commits',
    endpoint: 'github_api',
    updateInterval: 900_000,     // every 15 min
    entityExtractor: extractCodeChanges,
    edgeExtractor: extractChangeImpact,
    confidenceScore: 0.95
  },
  {
    name: 'news_feed',
    endpoint: 'news_api',
    updateInterval: 1_800_000,
    entityExtractor: extractNamedEntities,
    edgeExtractor: extractEventRelations,
    confidenceScore: 0.7         // external news = lower confidence
  }
];
```

#### Priority Order for Tech Genie

1. **First-party product metrics** (Supabase analytics, Vercel logs) — confidence: 1.0
2. **GitHub activity** (commits, PRs, issues) — confidence: 0.95
3. **User conversations** (facts extracted via knowledgeExtractor) — confidence: 0.8
4. **Web/news feeds** — confidence: 0.6–0.7
5. **AI-inferred facts** — confidence: 0.4–0.6, always flagged as inferred

---

### Phase 6 — Object Permanence Layer

**The fix for the root cause.** Entities persist across sessions with full state history.

```typescript
interface PermanentEntity {
  id: string;
  type: 'person' | 'product' | 'concept' | 'event' | 'claim' | 'organization';
  
  // Core identity — never changes
  canonical_name: string;
  aliases: string[];
  created_at: Date;
  
  // Current state — updates over time
  current_attributes: Record<string, AttributeValue>;
  
  // Full history — never deleted, only superseded
  attribute_history: WorldStateSnapshot[];
  
  // Relationships
  causal_edges_out: CausalEdge[];
  causal_edges_in: CausalEdge[];
  
  // Epistemic metadata
  confidence: number;
  source: string;
  last_verified: Date;
  contradicted_by?: string[];
}
```

#### Speaker Attribution (Solves Pronoun Collapse)

Every claim in the graph is tagged with:
- `asserted_by`: who made this claim
- `context`: what conversation/document it came from
- `timestamp`: when it was made
- `confidence_at_assertion`: how confident the source was

This means the graph can answer: *"Who said X, when, and in what context?"* — eliminating the misattribution cascade.

---

## Implementation Roadmap

### Sprint 1 (1–2 weeks) — Foundation
- [ ] Schema migration: add temporal columns to knowledge_nodes + knowledge_edges
- [ ] Add `relationship_type` enum and causal edge support
- [ ] `WorldStateSnapshot` table
- [ ] Update `graphStore.ts` to write temporal metadata on all inserts

### Sprint 2 (2–3 weeks) — Delta Engine
- [ ] `ai_output_audit` table + migration
- [ ] Claim extractor service (takes AI output → array of discrete claims)
- [ ] Graph lookup + verdict scoring
- [ ] `model_truth_scores` materialized view
- [ ] Wire into `conversationEngine.ts` as async post-processing step

### Sprint 3 (3–4 weeks) — Causal Graph
- [ ] Causal edge ingestion pipeline
- [ ] `traceCausality()` query method in graphStore
- [ ] Causal chain visualization (frontend)
- [ ] Speaker attribution tagging on all ingested claims

### Sprint 4 (4–6 weeks) — Grounding Feeds
- [ ] First-party metrics feed (product analytics → graph)
- [ ] GitHub feed (commit activity → graph)
- [ ] Feed scheduler + conflict resolution (what wins when sources disagree?)

### Sprint 5 (6–10 weeks) — Simulation Layer
- [ ] `WorldModel` class: simulate(currentState, action, goal, horizons)
- [ ] Historical pattern matching from causal graph
- [ ] Counterfactual node generation
- [ ] Integration with UCOL router for simulation-backed responses

---

## The Strategic Moat

Every AI company is racing to build better models.  
Almost no one is building the **world state layer** — the persistent, causal, temporal ground truth that models get held against.

The company that owns this layer:
- Can **audit any model's output** against reality with traceable sources
- Gets **smarter with every interaction** (the graph compounds; models don't)
- Can offer enterprises **verifiable outputs** — something no LLM alone can provide
- Is building **infrastructure**, not a product — infrastructure is defensible

LeCun said LLMs are a dead end for AGI at the frontier. He's right.  
But a world model *built on top of* LLMs — using them as inference engines while the graph provides ground truth, persistence, and causal reasoning — that's the practical path to something genuinely different.

**This is the UCOL thesis made concrete.**

---

## Files To Create (Implementation)

```
lib/world-model/
├── types.ts                    # WorldState, PermanentEntity, CausalEdge, ClaimVerdict
├── worldStateStore.ts          # Temporal graph R/W, snapshot capture
├── causalGraph.ts              # Causal edge ingestion + traceCausality()
├── deltaEngine.ts              # AI output → claim extraction → verdict scoring
├── simulationEngine.ts         # simulate(state, action, goal) → predicted outcomes
├── groundingFeeds/
│   ├── index.ts                # Feed scheduler + orchestrator
│   ├── productMetricsFeed.ts   # First-party analytics → graph
│   ├── githubFeed.ts           # GitHub activity → graph
│   └── newsFeed.ts             # External news → graph (low confidence)
├── objectPermanence.ts         # PermanentEntity CRUD + attribute history
└── speakerAttribution.ts       # Claim → speaker tagging, pronoun resolution

supabase/migrations/
└── 20260304_world_model_schema.sql   # All schema changes for Phase 1 + 2
```

---

## References

- LeCun, Y. (2022). *A Path Towards Autonomous Machine Intelligence.* OpenReview.
- The Pythagorean comma as epistemic error accumulation model (internal theory, Invidious, 2026)
- UCOL Architecture: `research/gacb/` (CONFIDENTIAL)
- Knowledge Graph current impl: `lib/memory/graphStore.ts`
- Conversation Engine: `lib/llm/conversationEngine.ts`
