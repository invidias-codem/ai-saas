# Lattice OS Deployment Runbook

**Scope**: Production-style local + Vercel deployment of the JEPA predictor edge route and PM2 sync worker.  
**Audience**: Engineers reproducing the architecture from the `ai-saas` repository.  
**Assumptions**: You have a Unix-like shell, Node.js 20+, pnpm 10+, Python 3.11+, and PM2 installed.

---

## 1. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ or 22+ | Vercel edge runtime |
| pnpm | 10+ or 11+ | Workspace package manager |
| Python | 3.11+ | PM2 worker runtime |
| PM2 | latest | Long-lived daemon manager |
| Vercel CLI | latest | Deploy / preview |
| Supabase project | — | `DivergenceEvent` telemetry sink |

### 1.1 Clone and install

```bash
git clone https://github.com/invidias-codem/ai-saas.git
cd ai-saas
pnpm install
```

### 1.2 Environment variables

Create `.env.local` in the repo root with:

```bash
# Supabase telemetry (for PM2 worker)
SUPABASE_TELEMETRY_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# Next.js public config (Vercel)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>

# Optional: override ONNX export path
JEPA_ONNX_PATH=/Users/jjem/Projects/ai-saas/public/wasm/predictor.onnx
```

**Security**: `.env.local` is gitignored. Never commit service role keys.

---

## 2. Local PM2 Worker

### 2.1 Python environment

```bash
# Recommended: use the project venv or a dedicated env
python3 -m venv .venv
source .venv/bin/activate
pip install torch onnx supabase python-dotenv
```

**Known issue**: NumPy 2.x + PyTorch 2.2.2 on macOS emits import warnings. These do not affect ONNX export. If desired:

```bash
pip install "numpy<2"
```

### 2.2 Verify the ONNX export path

```bash
python3 -c "import os; print(os.environ.get('JEPA_ONNX_PATH', 'public/wasm/predictor.onnx'))"
```

Default fallback: `public/wasm/predictor.onnx` relative to repo root.

### 2.3 Start the worker

```bash
pm2 start ecosystem.config.json
pm2 save
```

Verify:

```bash
pm2 list
pm2 logs jepa-main --lines 40
```

Expected log lines:

```
[MainWorker] started
[MainWorker] ONNX sync loop started; interval=300.0s
[Telemetry] disabled: Supabase URL/key missing.   # optional if env vars absent
```

### 2.4 Worker lifecycle

| Command | Action |
|---------|--------|
| `pm2 restart jepa-main` | Restart after code changes |
| `pm2 logs jepa-main` | Tail logs |
| `pm2 stop jepa-main` | Graceful stop |
| `pm2 delete jepa-main` | Remove from PM2 |

---

## 3. Vercel Edge Route

### 3.1 Public route matcher

`/api/jepa/predict` **must** be in `proxy.ts` `createRouteMatcher`, or Clerk middleware will block it:

```ts
const isPublicRoute = createRouteMatcher([
  '/api/jepa/infer',
  '/api/jepa/predict',
  // ...
]);
```

### 3.2 Deploy to Vercel

```bash
vercel link
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel --prod
```

**Environment note**: Vercel build machines use `NODE_OPTIONS=--max-old-space-size=6144`. Local builds may need `12288`.

### 3.3 Route contract

`POST /api/jepa/predict`

**Request body**

```json
{
  "latentState": [0.1, 0.2, ...],
  "latentAction": [0.05, -0.1, ...]
}
```

**Success response**

```json
{
  "status": "success",
  "predictedState": [0.81, -0.24, ...],
  "totalMs": 12,
  "warmStart": true
}
```

**Failure response**

```json
{
  "status": "error",
  "fallbackToSyntactic": true,
  "error": "<message>"
}
```

**Behavioral contract**: Any WASM, memory, or parse error returns 500 with `fallbackToSyntactic: true`. Consumers must treat this as a circuit-breaker trip and fall back to additive rollout.

---

## 4. ONNX Artifact Sync

### 4.1 Python → ONNX

The `MainWorker.export_predictor_onnx()` method runs on a configurable interval (default 300s) and writes to `JEPA_ONNX_PATH` or `public/wasm/predictor.onnx`.

**Inputs**:
- `predictor` module from `jepa_loss.py`
- Dummy input shape: `(1, embedding_dim)`

**Outputs**:
- `predictor.onnx` with inputs `["z"]`, outputs `["z_pred"]`, dynamic batch axis.

### 4.2 Vercel hot-load

Vercel serves `public/wasm/predictor.onnx` as a static asset. The `/api/jepa/predict` route loads it via:

```ts
const modelPath = join(process.cwd(), "public", "wasm", "predictor.onnx");
await ort.InferenceSession.create(`file://${modelPath}`);
```

**Caching**: Module-level `cachedPredictorSession` + `initializationPromise` lock amortizes cold-start across container invocations.

---

## 5. End-to-End Verification

### 5.1 TypeScript compilation

```bash
NODE_OPTIONS=--max-old-space-size=12288 pnpm exec tsc --noEmit -p tsconfig.json
```

Must exit 0 with no `lib/jepa` errors.

### 5.2 Fixed-seed test harness

```bash
pnpm test __tests__/lib/jepa/latentMcts.test.ts
```

Expected: 7/7 passing.

### 5.3 Live route probe

```bash
# Cold start
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
  http://localhost:3000/api/jepa/predict \
  -X POST -H "Content-Type: application/json" \
  -d '{"latentState":[0.1,0.2,0.3],"latentAction":[0.05,-0.1,0.02]}'
```

Expected: HTTP 200, latency ~3s first call.

```bash
# Warm start
curl -s http://localhost:3000/api/jepa/predict \
  -X POST -H "Content-Type: application/json" \
  -d '{"latentState":[0.1,0.2,0.3],"latentAction":[0.05,-0.1,0.02]}' | jq .
```

Expected: `warmStart: true`, latency <1s locally, 10–20ms in production.

### 5.4 Agent runtime probe

```bash
pnpm exec tsx scripts/probe-mcts-agent.ts
```

Expected output:

```
usedPredictor:        true
bestAction:           inline_variable
energy:               0.000000
iterations:           12
summary:              MCTS iterations=12 branches=1 bestEnergy=0.0000
✓ Circuit breaker remained closed
✓ Live predictor embeddings were used for latent rollouts
✓ MCTS orchestrator successfully traversed the latent space
```

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` on `/api/jepa/predict` | Route missing from `createRouteMatcher` | Add `/api/jepa/predict` to `proxy.ts` public routes |
| `Cannot find module '@/lib/jepa/p2p/serialization'` | File untracked by git | `git add lib/jepa/p2p/serialization.ts` |
| PM2 worker crashes on `import torch` | NumPy 2.x / PyTorch 2.2.2 incompatibility on macOS | `pip install "numpy<2"` or ignore warnings |
| `PGRST205: table 'public.divergence_events'` | Table name mismatch | Use `jepa_divergence_events` in `telemetry_consumer.py` |
| `supabase` module missing | Not installed in PM2 env | `pip install supabase` in the worker venv |
| `TypeScript compile error: isolatedModules` | Mixed `export { ..., type X }` | Split into separate value and type export blocks |
| Warm latency >100ms locally | Dev server I/O overhead | Expected; production Vercel isolates cache WASM in memory |
| `StrictSign` type error | Published typings mismatch | Cast `globalSignaturePolicy: 'Strict' as any` |

---

## 7. Security and Operational Notes

- **Credentials**: All Supabase keys are stored in `.env.local` and injected at runtime. Never log full key values.
- **Gossip transport**: P2P code must run in standalone Node/PM2 only. Do NOT import `lib/jepa/p2p/*` from Vercel Edge Runtime.
- **ONNX trust boundary**: The predictor artifact is written by a local Python process and loaded by edge WASM. Treat `public/wasm/predictor.onnx` as executable content; validate its provenance in multi-tenant deployments.
- **Circuit breaker**: The `fallbackToSyntactic: true` contract is the primary safety valve. All MCTS consumers must respect it.

---

## 8. Quick-Start Checklist

- [ ] `git clone` + `pnpm install`
- [ ] `.env.local` with Supabase credentials
- [ ] `pnpm exec tsc --noEmit -p tsconfig.json` clean
- [ ] `pnpm test __tests__/lib/jepa/latentMcts.test.ts` 7/7
- [ ] `/api/jepa/predict` added to `proxy.ts`
- [ ] `pm2 start ecosystem.config.json`
- [ ] `pm2 logs jepa-main` shows `[MainWorker] started`
- [ ] `public/wasm/predictor.onnx` exists
- [ ] Vercel deploy with env vars
- [ ] `curl /api/jepa/predict` returns HTTP 200
- [ ] `pnpm exec tsx scripts/probe-mcts-agent.ts` shows `usedPredictor: true`

---

## 9. Open Research Items

Tracked separately in the systems manifesto (`LATTICE-OS-MANIFESTO.md`):

- DP-SGD / low-rank SVD weight serialization
- Formal Byzantine robustness bounds for AEA under non-IID heterogeneity
- Empirical evaluation on HumanEval / MBPP
- Scaling action space beyond 6 hardcoded primitives
- P2P incentive mechanism

---  

## 10. VJEPA and Sparse Variance Edge Contract  

### 10.1 Predictor outputs

The Vercel edge route serves the ONNX predictor with:

- Outputs: `mu` (`float32[128]`), `log_var` (`float32[128]`)
- Sparse variance response: `varIndices[]`, `varValues[]`
- Missing indices use baseline variance `θ_v = 0.01`

### 10.2 Circuit breaker

| Budget | Value | Purpose |
|--------|-------|---------|
| Cold start | 3000ms | Initial WASM + ONNX load |
| Warm start | 250ms | Cached inference |
| Max variance dim | 0.95 | `τ_v` trip threshold |
| Sparse variance threshold | 0.01 | `θ_v` baseline |

On trip: `fallbackToSyntactic: true`, deterministic fallback, no randomization.

### 10.3 Response contract

```json
{
  "status": "success",
  "mu": [ ... ],
  "varIndices": [ ... ],
  "varValues": [ ... ],
  "meanVariance": 0.01,
  "maxVarianceDim": 0.95,
  "fallbackToSyntactic": false,
  "totalMs": 12,
  "warmStart": true
}
```

---  

## 11. Spectral FFT Compression  

### 11.1 Artifacts

| File | Purpose |
|------|---------|
| `lib/jepa/compression/spectral-fft.ts` | Zero-dependency Radix-2 FFT codec for N=128 |
| `research/world-model/jepa-local/bjepa/fft_io.py` | Python pack/unpack round-trip |
| `public/priors/*.json` | Base64-encoded spectral prior experts |

### 11.2 Wire format

`[num_coeffs: uint32][real: f32][imag: f32]...` little-endian.  
TypeScript uses `DataView`; Python uses `struct.pack('<I')` / `struct.pack('<ff')`.

### 11.3 Performance

| keep_ratio | payload | cosine |
|------------|---------|--------|
| 1.0 | 514 bytes | 1.0 |
| 0.25 | ~140 bytes | > 0.99 |
| 0.125 | ~76 bytes | > 0.99 |

---  

## 12. BJEPA Prior Experts  

### 12.1 Authoring

Generate with:

```bash
cd research/world-model/jepa-local
python3 bjepa/generate_prior.py
```

Outputs Base64-encoded JSON into `public/priors/`.

### 12.2 Runtime loading

`lib/jepa/priors.ts` statically imports prior JSONs.  
`loadPriorExpert(constraintId)` returns `priorMu` / `priorVar` arrays for PoE fusion.

---  

## 13. GossipSub v1.4 Mesh  

### 13.1 Heartbeat

- Normal: 1500ms
- Variance spike: 500ms

Spike detection: Python PM2 worker writes `jepa:mesh:variance_spike` to Upstash Redis with 60s TTL. TypeScript transport polls every 5s.

### 13.2 JSONL queue

Outgoing jobs are appended to `gossip_queue.jsonl` by the TS worker. The Python daemon drains this queue and decodes spectral beliefs with `base64.b64decode()` before calling `fft_io.unpack_belief_and_invert()`.

---  

## 14. Troubleshooting Addendum  

| Symptom | Cause | Fix |
|---------|-------|-----|
| `./lib/jepa/priors.ts:1:1` Module not found | Wrong import path | Use `./compression/spectral-fft` |
| `Float32Array<ArrayBufferLike>` TS error | Strict Vercel typing | Use plain `number[]` at boundary |
| `Cannot find name 'expandSparseVariance'` | Missing import | Import from `@/lib/jepa/vjepa` |
| Spectral decoder returns NaNs | Baseline variance too low | Ensure omitted indices use `θ_v = 0.01` |
| PM2 JSONL parse error | Missing `base64` field | Verify `aggregationJobToJson()` output |
