# JKlaw Smart Instance Manager

Keeps Vast.ai GPU costs near zero by only running the instance when there's actual traffic.

## Architecture

```
User / OpenClaw / Tech Genie
         ↓
   Smart Proxy (port 8003)   ← always running on MacBook / cheap VPS
         ↓
   LambdaInstanceManager
    ├── Instance running?  → proxy request directly
    └── Instance stopped?  → launch → wait for ready → proxy request
                                            ↓
                              Auto-terminate after 15min idle
```

## Cost Model

| State | Cost |
|-------|------|
| Idle (no requests) | $0.00 |
| Active (1x A100 80GB) | $1.29/hr |
| Typical day (2hr active) | ~$2.58/day |
| Old always-on 8B | $1.29 × 24 = $30.96/day |

**Savings: ~92% cost reduction** vs always-on.

## Cold Start Behavior

- First request after idle: ~90s wait (Lambda boot + Docker + model load)
- Subsequent requests: instant (instance stays warm for 15min)
- Configurable via `IDLE_TIMEOUT_MINUTES`

## Setup

### 1. Add Supabase migration
```bash
supabase db push  # runs 20260324_lambda_state.sql
```

### 2. Set environment variables
```bash
LAMBDA_API_KEY=your_lambda_api_key
LAMBDA_INSTANCE_TYPE=gpu_1x_a100_sxm4
LAMBDA_REGION_NAME=us-west-2
LAMBDA_SSH_KEY_NAME=your-ssh-key-name
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
IDLE_TIMEOUT_MINUTES=15
```

### 3. Encode the startup script
```bash
STARTUP_SCRIPT_B64=$(base64 -i startup.sh)
export STARTUP_SCRIPT_B64
```

### 4. Run the proxy
```bash
# Local (MacBook)
pip install -r requirements.txt
uvicorn proxy:app --host 0.0.0.0 --port 8003

# Or via Docker
docker build -t jklaw-proxy .
docker run -d --name jklaw-proxy \
  -p 8003:8003 \
  -e LAMBDA_API_KEY=$LAMBDA_API_KEY \
  -e LAMBDA_INSTANCE_TYPE=$LAMBDA_INSTANCE_TYPE \
  -e LAMBDA_REGION_NAME=$LAMBDA_REGION_NAME \
  -e LAMBDA_SSH_KEY_NAME=$LAMBDA_SSH_KEY_NAME \
  -e SUPABASE_URL=$SUPABASE_URL \
  -e SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY \
  -e IDLE_TIMEOUT_MINUTES=15 \
  -e STARTUP_SCRIPT_B64=$STARTUP_SCRIPT_B64 \
  jklaw-proxy
```

### 5. Update OpenClaw config
Change the Ollama baseUrl from the Lambda IP to your proxy:
```json
"ollama": {
  "baseUrl": "http://localhost:8003",  // or your VPS URL
  ...
}
```

### 6. Update Tech Genie
The legacy `LAMBDA_OLLAMA_URL` self-hosted Ollama path has been removed (inference now routes through NVIDIA NIM; embeddings through Gemini). No Vercel env var is required for the legacy proxy.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Proxy health + instance status |
| `GET /status` | Human-readable instance state + idle timer |
| `POST /admin/terminate` | Force-terminate the instance immediately |
| `* /*` | Everything else proxied to twin-router |

## Upgrading to Qwen2.5-Coder-72B

The `startup.sh` already targets `Qwen/Qwen2.5-Coder-72B-Instruct-AWQ`.
To activate, set `STARTUP_SCRIPT_B64` and launch a fresh instance.

The twin router's `MODEL_NAME` env var also needs updating:
```yaml
# docker-compose.yml on Lambda instance
twin-router:
  environment:
    - VLLM_URL=http://llm-server:8000
    - MODEL_NAME=Qwen/Qwen2.5-Coder-72B-Instruct-AWQ
```
