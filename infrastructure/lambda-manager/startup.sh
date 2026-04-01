#!/bin/bash
# Cloud-init startup script for Vast.ai GPU instance
# Runs as ubuntu user on first boot after launch
# Installs Docker, pulls twin-router image, starts vLLM + twin-router

set -e
LOG=/home/ubuntu/startup.log
exec >> $LOG 2>&1

echo "=== JKlaw instance startup $(date) ==="

# ── Docker ──────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker ubuntu
fi

# ── NVIDIA Container Toolkit ────────────────────────────────────────────────
if ! dpkg -l | grep -q nvidia-container-toolkit; then
  distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
    gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update -qq
  apt-get install -y -qq nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
fi

# ── Directories ─────────────────────────────────────────────────────────────
mkdir -p /home/ubuntu/twin-router
cd /home/ubuntu

# ── Pull twin-router source from GitHub ─────────────────────────────────────
# Uses a sparse checkout of just the infrastructure/ folder
if [ ! -d /home/ubuntu/ai-saas ]; then
  git clone --filter=blob:none --sparse \
    https://github.com/invidias-codem/ai-saas.git /home/ubuntu/ai-saas
  cd /home/ubuntu/ai-saas
  git sparse-checkout set infrastructure/
else
  cd /home/ubuntu/ai-saas
  git pull --ff-only
fi

cp /home/ubuntu/ai-saas/infrastructure/twin-router/* /home/ubuntu/twin-router/

# ── docker-compose.yml ───────────────────────────────────────────────────────
cat > /home/ubuntu/docker-compose.yml << 'COMPOSE'
version: "3.9"
services:
  llm-server:
    image: vllm/vllm-openai:latest
    container_name: genie-llm
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
    volumes:
      - /home/ubuntu/.cache/huggingface:/root/.cache/huggingface
    command: >
      --model Qwen/Qwen2.5-Coder-72B-Instruct-AWQ
      --quantization awq
      --gpu-memory-utilization 0.92
      --max-model-len 32768
      --served-model-name hermes3:8b
      --host 0.0.0.0
      --port 8000
      --trust-remote-code
    ports:
      - "8000:8000"
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  twin-router:
    build:
      context: ./twin-router
      dockerfile: Dockerfile
    container_name: genie-twins
    environment:
      - VLLM_URL=http://llm-server:8000
    ports:
      - "8002:8002"
    depends_on:
      - llm-server
    restart: unless-stopped
COMPOSE

# ── Start services ────────────────────────────────────────────────────────────
cd /home/ubuntu
docker compose pull llm-server
docker compose build twin-router
docker compose up -d

echo "=== Startup complete $(date) ==="
