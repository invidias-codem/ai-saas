# RunPod Manual Deployment Guide for Lattice-1

**Cost: ~$1.50/hr (A100-40GB) | No spend limits | 5-min setup**

---

## 1. Create RunPod Account & Get API Key

1. Go to https://runpod.io → Sign up
2. Add billing (credit card) — pay per second
3. Get API key: https://runpod.io/console/user/settings → "Create API Key"

---

## 2. Create Pod (Web UI or CLI)

### Via Web UI (Easiest):
1. Console → **Pods** → **Deploy** → **On-Demand**
2. **GPU**: A100-40GB (or A100-80GB if available)
3. **Template**: **PyTorch 2.5.1 / CUDA 12.1** (runpod/pytorch:2.5.1-py3.11-cuda12.1-devel)
4. **Container Disk**: 200 GB
5. **Volume Disk**: 100 GB (mount at `/workspace`)
6. **Expose Ports**: 8000 (HTTP), 22 (SSH)
7. **Deploy**

### Via CLI:
```bash
export RUNPOD_API_KEY="your_key_here"

runpodctl create pod \
  --name lattice-1-merge \
  --gpu "A100-40GB" \
  --image "runpod/pytorch:2.5.1-py3.11-cuda12.1-devel" \
  --container-disk 200 \
  --volume-disk 100 \
  --volume-mount-path /workspace \
  --ports "8000/http,22/tcp"
```

---

## 3. SSH Into Pod

```bash
# Get connection info from console or:
runpodctl get pod lattice-1-merge

# SSH (replace with your pod's IP/port)
ssh root@xxx.xxx.xxx.xxx -p xxxxx
```

---

## 4. Run Merge Inside Pod

```bash
# Once inside pod:
cd /workspace

# Clone repo (or copy files)
git clone https://github.com/invidias-codem/ai-saas.git
cd ai-saas

# Install mergekit
pip install mergekit@git+https://github.com/arcee-ai/mergekit.git huggingface_hub[hf_transfer] safetensors torch transformers accelerate peft

# Set HF transfer for faster downloads
export HF_HUB_ENABLE_HF_TRANSFER=1

# Run merge (uses cached models in /workspace if volume mounted)
mergekit-yaml mergekit-configs/lattice-1-dare-ties.yaml /workspace/lattice-1-merged --copy-tokenizer

# Verify
ls -la /workspace/lattice-1-merged/
```

---

## 5. Deploy vLLM Server

```bash
# Install vLLM
pip install vllm==0.6.3

# Start server (background)
nohup python -m vllm.entrypoints.openai.api_server \
  --model /workspace/lattice-1-merged \
  --served-model-name lattice-1 \
  --host 0.0.0.0 \
  --port 8000 \
  --tensor-parallel-size 1 \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.9 \
  --trust-remote-code \
  --disable-log-requests \
  --enable-prefix-caching \
  > /workspace/vllm.log 2>&1 &

# Wait for startup (~30-60s)
sleep 60
tail -f /workspace/vllm.log
```

---

## 6. Test the Endpoint

```bash
# From pod (or local via port forward)
curl http://localhost:8000/v1/models

curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "lattice-1",
    "messages": [{"role": "user", "content": "Write a Rust async HTTP client with retries"}],
    "temperature": 0.3,
    "max_tokens": 2048
  }'
```

---

## 7. Expose Publicly (Optional)

### Option A: RunPod Public Port (Already done if you exposed 8000)
- URL: `https://<pod-id>-8000.proxy.runpod.net/v1`
- Use this as `LATTICE1_BASE_URL`

### Option B: Cloudflare Tunnel (Custom domain)
```bash
# On pod
cloudflared tunnel --url http://localhost:8000
# Gives you https://xxx.trycloudflare.com/v1
```

### Option C: ngrok
```bash
ngrok http 8000
```

---

## 8. Configure Hermes

```bash
# On your Mac
export LATTICE1_BASE_URL="https://<pod-id>-8000.proxy.runpod.net/v1"

# Load skill
hermes skill load hermes_skills/lattice1

# Test
hermes tool lattice1_chat 'messages=[{"role":"user","content":"Hello Lattice-1!"}]'
```

---

## Cost Estimate

| Phase | Time | Cost (A100-40GB @ $1.50/hr) |
|-------|------|----------------------------|
| Pod startup | 2 min | $0.05 |
| Model download (cached in volume) | 10 min | $0.25 |
| DARE-TIES merge (4×14B) | 15 min | $0.38 |
| vLLM startup + test | 5 min | $0.13 |
| **Total** | ~32 min | **~$0.80** |

**Keep pod running for demo**: ~$1.50/hr (stop when done)

---

## Cleanup

```bash
# Stop pod (keeps volume for next time)
runpodctl stop pod lattice-1-merge

# Or terminate (deletes volume)
runpodctl terminate pod lattice-1-merge
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| OOM during merge | Use `--lazy-unpickle` flag, or try linear merge config |
| vLLM won't start | Check `nvidia-smi`, ensure GPU visible, try `--enforce-eager` |
| Slow downloads | Ensure `HF_HUB_ENABLE_HF_TRANSFER=1` |
| Port not accessible | Check RunPod console → Pod → Ports, ensure 8000 is public |

---

## Next Steps After Success

1. **Record 90-sec demo** using the live endpoint
2. **Send to Inngest/Modal** warm contacts
3. **Get 3 investor intros** to Railway/Linear/Temporal
4. **Zero cold emails** until warm intros secured

---

*RunPod has no monthly spend limits — pay only for GPU seconds used.*