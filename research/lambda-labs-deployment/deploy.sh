#!/bin/bash
set -e

echo "🚀 Setting up Lambda Labs GPU Instance for Tech Genie..."

# 1. Update and install prerequisites
sudo apt update && sudo apt install -y curl git jq build-essential

# 2. Install Docker & Docker Compose
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
fi

# 3. Install NVIDIA Container Toolkit (Lambda Labs usually has drivers pre-installed)
if ! dpkg -l | grep -q nvidia-container-toolkit; then
    echo "🟩 Installing NVIDIA Container Toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
      sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
      sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    sudo apt update
    sudo apt install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
fi

# 4. Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env template..."
    cat << 'ENV_EOF' > .env
HF_TOKEN=your_huggingface_token
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_key
CLOUDFLARE_TUNNEL_TOKEN=your_cloudflare_tunnel_token
ENV_EOF
    echo "⚠️  Please edit .env with your secrets before running docker-compose up!"
fi

echo "✅ Environment ready! Run 'docker-compose up -d' after updating .env."
