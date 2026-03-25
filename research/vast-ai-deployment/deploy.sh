#!/bin/bash
# ── Tech Genie — Vast.ai Deploy Script ───────────────────────────────────────
# Run this on the Vast.ai instance after SSH-ing in.
# Instance: 4x RTX 2080 Ti | CUDA 12.1 | nvidia/cuda_12.1.0-devel-ubuntu22.04
# Model: hf.co/Qwen/Qwen3.5-35B-A3B (Docker Model Runner)
# Usage: bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "🚀 Setting up Tech Genie on Vast.ai..."

# 1. Update system
sudo apt update && sudo apt install -y curl git jq

# 2. Install Docker (Vast.ai usually has it; skip if present)
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    newgrp docker
fi

# 3. Install Docker Compose v2
if ! docker compose version &> /dev/null; then
    echo "📦 Installing Docker Compose v2..."
    DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
    mkdir -p "$DOCKER_CONFIG/cli-plugins"
    curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
        -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
    chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"
fi

# 4. Enable Docker GPU support (nvidia-container-toolkit)
if ! nvidia-ctk --version &> /dev/null 2>&1; then
    echo "🟩 Installing NVIDIA Container Toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
        | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
        | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
        | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    sudo apt update && sudo apt install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
else
    echo "✅ NVIDIA Container Toolkit already present."
fi

# 5. Verify GPUs
echo "🖥️  GPU check:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

# 6. Create .env
if [ ! -f .env ]; then
    echo "📝 Creating .env..."
    cat << 'ENV_EOF' > .env
SUPABASE_URL=https://ozevwhiipwbcvyzkbhib.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
CLOUDFLARE_TUNNEL_TOKEN=your_cloudflare_tunnel_token
ENV_EOF
    echo ""
    echo "⚠️  Edit .env — fill in SUPABASE_SERVICE_KEY and CLOUDFLARE_TUNNEL_TOKEN:"
    echo "    nano .env"
    echo ""
    echo "Then run: docker compose up -d"
    exit 0
fi

# 7. Pull images and start
echo "📥 Pulling images..."
docker compose pull cloudflared

echo "🏗️  Starting stack..."
docker compose up -d

echo ""
echo "⏳ Docker Model Runner will pull Qwen3.5-35B-A3B on first start."
echo "   Monitor: docker logs -f genie-llm"
echo ""
echo "✅ Done! Set in Vercel:"
echo "   LAMBDA_OLLAMA_URL=https://your-cloudflare-tunnel-url"
echo "   OLLAMA_MODEL=hf.co/Qwen/Qwen3.5-35B-A3B"
