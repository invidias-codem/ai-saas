# Fact Extraction System for Hallucination Prevention

## Overview

The Fact Extraction System is a selective key-value fact storage layer that extracts critical information from conversations and injects it into prompts to prevent AI hallucinations. Unlike the general memory system that stores all conversation summaries, this system is intentionally selective—storing only high-confidence, critical facts that are most likely to cause hallucinations if missing.

## Architecture

```
User Query → Conversation API
    ↓
[Extract Critical Facts] ← Two-Stage Extraction
    ↓
[Keyword Matching] + [Gemini Confidence Scoring]
    ↓
[Deduplication] (if similar fact exists, merge confidence)
    ↓
Store in Firestore: users/{userId}/facts/{factId}
    ↓
[Retrieve High-Confidence Facts] (≥ 0.80 confidence)
    ↓
[Inject Facts-First into Prompt] (before memory context)
    ↓
LLM Response (anchored by verified facts)
```

## Fact Types (5 Critical Categories)

### 1. **Decision** (90% confidence)
Captures what the team/user decided to do.

**Examples:**
- "DECIDED: Use PostgreSQL instead of MongoDB for ACID compliance"
- "We'll use React for the frontend framework"
- "Selected Node.js for the backend runtime"

**Extraction trigger:** `DECISION:`, `DECIDED`, `WILL USE`, `WE'LL USE`, `CHOOSING`

**Why it matters:** Hallucinations often ignore previous decisions and suggest alternatives that were already ruled out.

---

### 2. **Action Item** (85% confidence)
Captures what needs to be done, by whom, and optionally by when.

**Examples:**
- "TODO: Fix bug in payment integration by Friday"
- "Need to review PR #234 before merging"
- "Implement error handling in auth module"

**Extraction trigger:** `TODO:`, `ACTION:`, `need to`, `must`, `have to`, action verbs + task

**Why it matters:** Prevents repeating already-assigned work or suggesting the same action twice.

---

### 3. **Blocker/Constraint** (88% confidence)
Captures what's blocking progress or limiting scope.

**Examples:**
- "BLOCKED: Waiting for design team's approval"
- "Budget constraint: $50k maximum"
- "Performance requirement: <100ms response time"

**Extraction trigger:** `BLOCKER:`, `BLOCKED`, `stuck`, `waiting for`, `constraint`, `limited`

**Why it matters:** LLM often ignores constraints and suggests expensive/impossible solutions.

---

### 4. **Project** (80% confidence)
Captures what the user is currently building/working on.

**Examples:**
- "Project: Building e-commerce platform with React/Node.js, due Q1 2025"
- "Working on: ML pipeline for fraud detection"
- "Current initiative: Migrate to microservices architecture"

**Extraction trigger:** `project:`, `working on:`, `building:`, `shipping:`, `initiative:`

**Why it matters:** Context about the user's domain and scope helps LLM calibrate responses appropriately.

---

### 5. **Verification** (95% confidence)
Captures explicit user confirmations of facts.

**Examples:**
- "Yes, that's correct"
- "My company: Acme Corp"
- "Team size is 8 engineers"

**Extraction trigger:** `Yes, that's right`, `confirmed`, `verified`, explicit `[noun] is [value]`

**Why it matters:** User-verified facts are the most reliable and should override speculative information.

---

## How It Works

### Phase 1: Two-Stage Extraction

**Stage 1: Keyword-Based Extraction (Fast)**
- Uses regex patterns to identify facts by keywords
- Fast, deterministic, high-precision
- Each fact gets an initial confidence score (0.60-0.95)

**Stage 2: Gemini Confidence Scoring (Accurate)**
- Validates facts using Gemini's language understanding
- Scores based on: explicitly stated vs. implied vs. speculative
- Adjusts confidence: 0.95 (explicit) → 0.60 (implied) → 0.0 (speculative/hypothetical)
- Only facts ≥ 0.75 confidence are stored

### Phase 2: Deduplication
- Before storing a fact, check Firestore for similar existing facts
- **Similarity match:** Same `(type, content)` pair with 80%+ text similarity
- **If duplicate found:** Merge by updating timestamp and confidence score
- **If new fact:** Store with new document ID

### Phase 3: Storage in Firestore
```
users/{userId}/facts/{factId}
├── type: "decision" | "action_item" | "blocker" | "project" | "verification"
├── content: string (the fact text, max 200 chars)
├── confidence: 0.75-1.0 (only high-confidence facts stored)
├── scope: "conversation" (expires in 30 days) | "user" (persistent)
├── extractedAt: timestamp
├── expiresAt: timestamp (conversation facts auto-expire after 30 days)
└── conversationId: optional (reference to source conversation)
```

### Phase 4: Retrieval & Injection
1. **Retrieve:** Get all facts with confidence ≥ 0.80 (5 recent + 5 persistent user facts)
2. **Format:** Organize by type (Decisions → Action Items → Blockers → etc.)
3. **Inject:** Prepend facts section to prompt BEFORE memory context

**Prompt structure:**
```
## About This User
[user context info]

## Critical Context (Verified Facts)  ← INJECTED FIRST
**Decisions Made:**
- Use PostgreSQL for ACID compliance
- React frontend framework

**Action Items:**
- Fix payment integration bug
- Review PR #234

**Current Blockers:**
- Waiting on design team

[rest of conversation memory context...]

[User's actual query]
```

---

## Storage & Efficiency

### Storage Optimization
- **Per-fact size:** 80-200 bytes
- **Per user (typical):** 1-2 KB total
- **Per conversation (50 conversations/user/year):** 2-3 MB
- **Storage cost:** ~$0.70/month per 1,000 users

### Limits to Control Growth
- **Max facts per user:** 50 active facts (older expired facts automatically deleted)
- **Max facts per conversation:** 10 facts (deduplication prevents bloat)
- **Conversation facts expire:** 30 days after extraction
- **User facts:** Never expire (until user deletes)

---

## Integration Points

### 1. Conversation API (`app/api/conversation/route.ts`)
```typescript
// Retrieve facts BEFORE generating response
const facts = await getHighConfidenceFacts(userId);
const factContext = formatFactsForPrompt(facts);

// Inject facts-first into prompt
const enhancedPromptText = userContextPrompt + factContext + memoryContext + userQuery;
```

### 2. Memory Capture (`functions/src/conversationCapture.ts`)
```typescript
// After storing memory, extract facts
const factExtractionResult = await extractFactsFromConversation(messages, summary);
const storedFacts = await storeExtractedFacts(userId, factExtractionResult.facts);
```

### 3. Fact Retrieval Function (`functions/src/factExtractor.ts`)
```typescript
// Cloud Function endpoint for retrieving facts
export const retrieveFactsForUser = functions.https.onRequest(async (req, res) => {
  const { userId, limit } = req.body;
  const facts = await getHighConfidenceFacts(userId, 'conversation', limit/2);
  // Return facts sorted by confidence
});
```

### 4. Utility Functions (`lib/ragMemory.ts`)
```typescript
// Client-side retrieval & formatting
export async function getHighConfidenceFacts(userId: string, limit = 10)
export function formatFactsForPrompt(facts: ExtractedFact[]): string
```

---

## Key Features

✅ **Selective Storage:** Only 5 fact types, only high-confidence (≥0.75)
✅ **Two-Stage Extraction:** Keyword matching + Gemini validation
✅ **Deduplication:** Prevents duplicate facts, merges confidence
✅ **TTL Expiration:** Conversation facts expire after 30 days
✅ **Fallback Safe:** If fact retrieval fails, conversation continues normally
✅ **Backward Compatible:** Works alongside existing memory system without changes
✅ **Gradual Rollout:** No breaking changes to existing API
✅ **Storage Efficient:** ~$0.70/month per 1,000 users

---

## Hallucination Prevention Examples

### Before (Without Facts)
```
User: "What tech stack should we use for the backend?"
LLM: "I recommend Go with PostgreSQL. It's scalable and fast."
Issue: User already decided on Node.js but LLM didn't know it.
```

### After (With Facts)
```
User: "What tech stack should we use for the backend?"
LLM sees facts:
  - DECISION: Use Node.js for backend runtime
  - ACTION: Set up Express server scaffolding

LLM: "Based on your earlier decision to use Node.js, I recommend Express for the server framework..."
✓ No hallucination - LLM respects previous decisions
```

---

## Confidence Scoring

| Confidence | Meaning | Inject? | Examples |
|-----------|---------|---------|----------|
| 0.95+ | Explicit verification | ✅ YES | "Yes that's correct", explicit confirmations |
| 0.85-0.94 | Clearly stated | ✅ YES | "DECISION:", "TODO:", explicit markers |
| 0.75-0.84 | High probability | ✅ YES | Project names mentioned 3+ times |
| 0.60-0.74 | Implied/uncertain | ⚠️ DEBUG ONLY | "Maybe we should...", "possibly..." |
| <0.60 | Speculative | ❌ DISCARD | "If we had...", "In theory..." |

---

## Troubleshooting

### Fact Not Being Extracted?
1. **Check confidence score:** Must be ≥0.75 to store
2. **Check keyword markers:** Ensure fact has clear extraction trigger
3. **Test with memory-inspector.ts:** `npx ts-node memory-inspector.ts [userId]`
4. **Check Firestore:** Verify facts subcollection exists at `users/{userId}/facts/`

### Facts Not Being Injected?
1. **Check retrieval function:** Ensure `retrieveFactsForUser` Cloud Function deployed
2. **Check scope:** Only facts with scope "conversation" or "user" retrieved
3. **Check confidence:** Facts must have confidence ≥0.80 to inject
4. **Check RAG_CLOUD_FUNCTION_URL:** Must be set in `.env.local`

### Hallucinations Still Occurring?
1. **Add explicit markers:** Use "DECISION:", "TODO:", "BLOCKER:" for better extraction
2. **Verify facts in Firestore:** Confirm facts are stored with correct type
3. **Check prompt format:** Ensure facts section in prompt before memory context
4. **Lower confidence threshold:** Consider 0.70 instead of 0.75 for broader coverage

---

## Next Steps / Future Enhancements

1. **Conflict Detection:** Flag contradictory facts (e.g., "Use React" vs "Use Vue")
2. **User Correction UI:** Allow users to mark facts as "incorrect" → auto-correct
3. **Temporal Reasoning:** "Supersedes" relationships (newer facts override older)
4. **Entity Linking:** Link facts to people, projects, tools mentioned
5. **Analytics Dashboard:** Show which facts prevent most hallucinations
6. **A/B Testing:** Measure accuracy improvement with/without facts

---

## Files Modified

- `functions/src/factExtractor.ts` (NEW) - Main extraction logic
- `functions/src/conversationCapture.ts` - Integrated fact extraction
- `functions/src/schemas.ts` - Added ExtractedFact interface
- `lib/schemas.ts` - Added ExtractedFact schema
- `lib/ragMemory.ts` - Added fact retrieval + formatting
- `app/api/conversation/route.ts` - Added fact injection to prompt
- `functions/src/index.ts` - Exported retrieveFactsForUser endpoint

---

## Summary

The Fact Extraction System provides surgical hallucination prevention by capturing and injecting only the most critical facts (decisions, blockers, action items) into prompts. By combining keyword extraction with Gemini confidence scoring and storing only high-confidence facts, the system minimizes storage overhead while maximizing accuracy.

**Result:** Users see AI responses that respect previous decisions, acknowledge constraints, and remember what's been decided—without the system storing speculative or unnecessary information.
