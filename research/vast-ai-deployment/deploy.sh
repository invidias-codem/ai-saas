#!/bin/bash
# ── Tech Genie — Vast.ai Deploy Script ───────────────────────────────────────
# Run this on the Vast.ai instance after SSH-ing in.
# Instance: 4x RTX 2080 Ti | CUDA 12.1 | Ubuntu 22.04
# Usage: bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "🚀 Setting up Tech Genie on Vast.ai..."

# 1. Update system
sudo apt update && sudo apt install -y curl git jq build-essential

# 2. Install Docker (Vast.ai base images often have it; skip if already present)
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "⚠️  Docker installed. You may need to log out/in for group to take effect."
    echo "    Run: newgrp docker"
fi

# 3. Install Docker Compose plugin (v2)
if ! docker compose version &> /dev/null; then
    echo "📦 Installing Docker Compose v2..."
    DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
    mkdir -p "$DOCKER_CONFIG/cli-plugins"
    curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
        -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
    chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"
fi

# 4. NVIDIA Container Toolkit
# Vast.ai instances with nvidia/cuda base image usually have this already.
# Only install if missing.
if ! nvidia-ctk --version &> /dev/null; then
    echo "🟩 Installing NVIDIA Container Toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
        | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
        | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
        | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    sudo apt update
    sudo apt install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
else
    echo "✅ NVIDIA Container Toolkit already present."
fi

# 5. Verify GPUs visible
echo "🖥️  GPU check:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

# 6. Create .env from template if not present
if [ ! -f .env ]; then
    echo "📝 Creating .env template..."
    cat << 'ENV_EOF' > .env
# ── Required ──────────────────────────────────────────────────────────────────
HF_TOKEN=your_huggingface_token
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# ── Cloudflare Tunnel ─────────────────────────────────────────────────────────
# Get from: Cloudflare Zero Trust → Networks → Tunnels → Create Tunnel → token
CLOUDFLARE_TUNNEL_TOKEN=your_cloudflare_tunnel_token
ENV_EOF
    echo ""
    echo "⚠️  Edit .env with your secrets before continuing:"
    echo "    nano .env"
    echo ""
    echo "Then run: docker compose up -d"
    exit 0
fi

# 7. Pull images and start
echo "📥 Pulling Docker images (vLLM download may take a few minutes)..."
docker compose pull cloudflared

echo "🏗️  Starting stack..."
docker compose up -d

echo ""
echo "⏳ vLLM will download Qwen/Qwen2.5-32B-Instruct on first start (~60GB)."
echo "   Monitor progress: docker logs -f genie-llm"
echo ""
echo "✅ Stack started! Services:"
echo "   LLM API  → http://127.0.0.1:8000/v1  (proxied via Cloudflare tunnel)"
echo "   Vector   → http://127.0.0.1:8080"
echo ""
echo "Once the tunnel is running, set LAMBDA_OLLAMA_URL in Vercel to your tunnel URL:"
echo "   e.g. https://jklaw-llm.gen1e.xyz"
