# JEPA WASM Fallback Implementation Spec

**Trigger:** WASM probe fails on staging due to bundle size >150MB uncompressed, cold-start >600ms, or locateFile/V8 heap errors.  
**Goal:** Preserve JEPA inference capability without violating Vercel serverless constraints.  
**Decision authority:** Kill criteria from `/api/wasm-probe` verdict.

---

## 1. Decision Matrix

| Failure Signal | Threshold | Fallback Tier |
|---|---|---|
| Uncompressed function bundle | >150 MB | **Tier 1** — External inference API |
| Cold-start latency | >600 ms | **Tier 2** — Static export worker |
| WASM locateFile / V8 heap error | Any failure | **Tier 1** — External inference API |
| SIMD unavailable + fallback still >600ms | Borderline | **Tier 2** — Static export worker |

**Rule:** Tier 1 always wins when the failure mode is structural (bundle or runtime error). Tier 2 is acceptable only for latency-only failures with a working WASM load path.

---

## 2. Tier 1 — External Inference API

### 2.1 Architecture

```
[Next.js API Route /api/jepa/infer]
  ↓
[Auth + Rate Limit Gate]
  ↓
[HTTP Client → External Inference Worker]
  ↓
[Worker: onnxruntime-node or llama.cpp / WASM]
  ↓
[Response with tensor/output]
```

### 2.2 Implementation

**A. New standalone worker (recommended first option)**

- **Runtime:** Cloudflare Workers, Deno Deploy, or Railway/Render with Node 20+
- **Stack:** `onnxruntime-node` (no WASM, no browser bundle)
- **Model delivery:** Pre-quantized ONNX model (e.g., JEPA small ~25MB) committed to worker storage or fetched from R2/S3
- **Endpoint:** `POST /infer` with JSON payload `{ input: [...], model_id: "jepa-small" }`
- **Timeout:** 30s hard cap with streaming chunked response for large tensors

**B. Alternative: Upstash QStash / Vercel Cron bridge**

- Schedule inference on-demand via QStash webhook to avoid cold-start penalty
- Returns job ID; client polls `/api/jepa/result/:id`
- Suitable for non-real-time JEPA predictions

### 2.3 Filesystem Resolution Error Handling

When `locateFile` fails in Vercel Edge:

1. **Detect:** Probe catch block returns `error.message` containing `locateFile`, `wasm`, or `Aborted`
2. **Mitigate:** Do NOT retry same WASM path. Immediately route to external worker.
3. **Logging:** Emit structured log `jepa.wasm.locateFile.failed` with `vercelRegion`, `functionBundleSizeMB`, `error`

### 2.4 Code Changes (Next.js side)

**File:** `app/api/jepa/infer/route.ts`

```ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JEPA_WORKER_URL = process.env.JEPA_WORKER_URL; // e.g. https://jepa-worker.example.com/infer
const JEPA_FALLBACK_ENABLED = process.env.JEPA_FALLBACK === 'true';

export async function POST(request: Request) {
  if (!JEPA_FALLBACK_ENABLED || !JEPA_WORKER_URL) {
    return NextResponse.json({ error: 'JEPA fallback not configured' }, { status: 501 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.JEPA_API_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const started = Date.now();

  try {
    const resp = await fetch(JEPA_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });

    if (!resp.ok) {
      throw new Error(`Worker responded ${resp.status}: ${resp.statusText}`);
    }

    const result = await resp.json();
    return NextResponse.json({
      ...result,
      fallback: true,
      workerLatencyMs: Date.now() - started,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: 'JEPA worker unavailable',
      message: error.message,
      fallback: true,
    }, { status: 502 });
  }
}
```

---

## 3. Tier 2 — Static Export Worker

### 3.1 Architecture

```
[Next.js Static Export /out/]
  ↓
[Separate Worker from /public/wasm/]
  ↓
[Service Worker or Edge Function loads WASM from /wasm/]
  ↓
[JEPA inference via fetch('/api/jepa/wasm-infer')]
```

### 3.2 Implementation

**A. Service Worker approach**

1. Build minimal standalone worker (`worker.js`) that imports `ort.wasm.min.mjs` from CDN or `public/wasm/`
2. Host at `/jepa-worker.js` as static asset
3. Register SW only on JEPA pages; all other pages unaffected
4. Use `postMessage` to communicate tensor data between page and SW

**B. Edge Function with static WASM**

1. Create `app/api/jepa/wasm-infer/route.ts` with **no onnxruntime-web import in main bundle**
2. Use Vercel Edge Runtime with dynamic import inside handler:
   ```ts
   const { InferenceSession, Tensor } = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort.min.mjs');
   ```
3. This keeps Next.js server bundle clean; WASM loads only at invocation

### 3.3 Filesystem Resolution Fix

If `locateFile` is the failure point:

```ts
const session = await InferenceSession.create(modelBuffer, {
  executionProviders: ['wasm'],
  locateFile: (file) => {
    // Fallback chain: public/ → CDN → node_modules
    if (typeof window !== 'undefined') {
      return `/wasm/${file}`;
    }
    // Edge runtime fallback
    return new URL(`https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/${file}`).toString();
  },
});
```

---

## 4. Hybrid Decision Flow

```
Probe fails?
  ├─ Bundle >150MB OR V8 heap/locateFile error
  │   └─→ Tier 1: External inference API immediately
  │
  └─ Cold-start >600ms only
      ├─ WASM loads successfully
      │   └─→ Tier 2: Static export worker with CDN fallback
      │
      └─ WASM fails intermittently
          └─→ Tier 1: External inference API
```

---

## 5. Implementation Checklist

### Immediate (this session)
- [x] Patch probe runtime bug (`Ort` → `ort`)
- [ ] Commit probe route
- [ ] Push to staging, set `ENABLE_JEPA=true`
- [ ] Hit `/api/wasm-probe`, capture JSON + build logs

### If Tier 1 triggered
- [ ] Create worker service (Railway/Render/Cloudflare)
- [ ] Add `JEPA_WORKER_URL`, `JEPA_API_SECRET` to Vercel env
- [ ] Implement `app/api/jepa/infer/route.ts`
- [ ] Add circuit breaker: if worker unreachable >3x in 60s, disable JEPA path
- [ ] Test with `curl -H "Authorization: Bearer <secret>"` from staging

### If Tier 2 triggered
- [ ] Add CDN fallback to `locateFile`
- [ ] Verify `public/wasm/` contains all required `.wasm` and `.mjs` files
- [ ] Test Edge Function cold-start with `vercel dev --runtime edge`
- [ ] If still >600ms, promote to Tier 1

### Monitoring
- Log every JEPA attempt with: `{tier, latencyMs, success, errorCode}`
- Alert on `errorCode: "locate_file_failed"` or `bundle_size_mb > 140`

---

## 6. Migration Path from Probe to Production

**Phase A — Probe (current)**
- Route gated by `ENABLE_JEPA=true`
- No production traffic touches it
- Validates kill criteria only

**Phase B — Shadow (if PASS)**
- Add `JEPA_ENABLED=true` alongside probe
- Log JEPA predictions but return existing LLM response
- Compare latency: JEPA shadow vs. actual LLM latency

**Phase C — Graduated rollout**
- 5% traffic → JEPA path if shadow latency within 20% of LLM
- Monitor P95, error rate, bundle size
- 100% or revert based on metrics

**Phase D — Fallback (if FAIL)**
- Disable `ENABLE_JEPA` globally
- Enable Tier 1 or Tier 2 based on failure mode
- Re-run probe with fallback active to validate new kill criteria

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vercel bundle limit hard block | High | Critical | Tier 1 ready to deploy |
| Cold-start >600ms | Medium | High | Tier 2 with CDN |
| locateFile fails in Edge | Medium | Critical | CDN fallback + Tier 1 |
| Worker latency >25s | Low | High | Timeout + graceful degradation |
| Auth bypass on JEPA endpoint | Low | Critical | Master bypass + rate limit |

---

**Spec status:** DRAFT — ready for review.  
**Next action:** Run probe on staging; if FAIL, execute Tier 1 or Tier 2 from this spec.
