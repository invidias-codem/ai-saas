# RLM ↔ Hermes/Lattice Integration Ideas

**Date:** 2026-06-14
**Source:** Analysis of https://github.com/alexzhang13/rlm

---

## Executive Summary

RLM (Recursive Language Models) is a Python inference engine that gives LLMs a persistent REPL environment with recursive sub-call capabilities. Its core patterns align well with Hermes' delegation model and Lattice's memory-native architecture.

---

## High-Value Patterns to Adopt

| RLM Concept | Hermes/Lattice Application |
|-------------|---------------------------|
| **`rlm_query` / `rlm_query_batched`** — recursive sub-calls with own REPL | Map to `delegate_task` with isolated terminal sessions; each sub-agent gets fresh context |
| **`llm_query` / `llm_query_batched`** — parallel direct LLM calls | Batch tool calls / parallel subagent spawning for independent subtasks |
| **REPL `answer["ready"] = True`** — explicit completion signal | Task completion via `status: "completed"` in todo/kanban; stream final answer to user |
| **Compaction/history variables** (`context_N`, `history_N`) | Lattice `ucol_procedural_memory` + conversation history in Supabase |
| **Custom tools injection** into REPL globals | Hermes skill loading + tool system; inject at delegation spawn time |
| **Trajectory logging** (JSONL) → **Visualizer** (Next.js) | Emit Hermes delegation traces as JSONL; reuse RLM visualizer for debugging |

---

## Integration Strategies

### 1. Microservice Bridge (Fastest, 1-2 days)
```python
# rlm_service.py — deploy on Modal/Daytona/E2B
from fastapi import FastAPI
from rlm import RLM

app = FastAPI()
rlm = RLM(
    backend="gemini",  # or openai, anthropic, vllm
    backend_kwargs={"model_name": "gemini-2.5-flash"},
    max_depth=2,
    max_iterations=10,
)

@app.post("/completion")
async def completion(prompt: str, root_prompt: str = None):
    result = rlm.completion(prompt, root_prompt)
    return {
        "response": result.response,
        "metadata": result.metadata,
        "usage": result.usage_summary.to_dict(),
        "execution_time": result.execution_time,
    }
```
Hermes calls via HTTP from a custom tool or `delegate_task` context.

### 2. TypeScript Port of Orchestration Pattern (Long-term)
Replicate the **orchestrator prompt** (`ORCHESTRATOR_ADDENDUM` in `rlm/utils/prompts.py`) as a Hermes skill:
- "Act as orchestrator, not solver"
- "Push long-context ops to sub-calls"
- "Delegate everything else"
- "Reserve tokens for high-level decisions"

### 3. Training Pipeline for Specialized Models
Use RLM's `prime-rl` + `verifiers` harness to train models for:
- Bluesky engagement optimization
- Code generation for Lattice OS components
- UCOL memory operations
Deploy trained models to vLLM → Hermes consumes via OpenAI-compatible endpoint.

### 4. Unified Trajectory Visualization
- Emit JSONL from Hermes cron jobs (`lattice-memory-sync`), delegations, Bluesky agent
- Feed into RLM visualizer (`/visualizer` — Next.js + shadcn/ui)
- Single dashboard for all agent trajectories

---

## What's NOT Portable (Different Execution Models)

| RLM Feature | Why It Doesn't Map |
|-------------|-------------------|
| Python `exec` REPL sandbox | Hermes is TypeScript/Node; no in-process code execution |
| `subcall_fn` recursive callback | Hermes delegation is async subprocess, not in-process function |
| `LocalREPL` globals/locals namespace | Different isolation model (process vs namespace) |

---

## Immediate Next Steps

1. **Test RLM locally** with your Gemini key:
   ```bash
   cd /tmp/rlm-repo && pip install -e . && python -c "
   from rlm import RLM
   rlm = RLM(backend='gemini', backend_kwargs={'model_name': 'gemini-2.5-flash'})
   print(rlm.completion('Test prompt').response)
   "
   ```

2. **Create Hermes skill** wrapping RLM HTTP client:
   - Skill: `rlm-client` with `rlm_complete(prompt, root_prompt?)` tool
   - Handles auth, retries, timeout mapping

3. **Map memory bridge → trajectory logging**:
   - Current: 66 skills → `ucol_procedural_memory` (Supabase) every 30 min
   - Add: Delegation traces → JSONL → visualizer

---

## Related Files in This Repo

- `lib/agents/bluesky/BlueskyResponder.ts` — could use RLM for deeper reasoning
- `app/api/cron/bluesky-engage/route.ts` — cron job that could delegate to RLM
- `lib/preview-generator.ts` — file processing that could use REPL for complex parsing
- `~/.hermes/cron/lattice-memory-sync` — trajectory emission point

---

## Decision Log

- [ ] Prototype microservice on Modal
- [ ] Port orchestrator prompt to Hermes skill
- [ ] Evaluate prime-rl training for Bluesky agent
- [ ] Integrate visualizer with Hermes cron output