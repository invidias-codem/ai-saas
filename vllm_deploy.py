#!/usr/bin/env python3
"""
Deploy Lattice-1 merged model to vLLM on Modal.
Usage: modal run vllm_deploy.py --model-path /output/merged-model --model-name lattice-1
"""

import modal

app = modal.App("lattice-1-vllm")

# vLLM image with all dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm==0.6.3",
        "huggingface_hub[hf_transfer]",
        "torch==2.5.1",
        "transformers==4.47.1",
        "accelerate",
        "safetensors",
        gpu="any",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "VLLM_USE_V1": "1"})
)

# Volume for model cache
model_volume = modal.Volume.from_name("hf-model-cache", create_if_missing=True)
# Volume for merged model output from mergekit
merged_volume = modal.Volume.from_name("lattice-1-output", create_if_missing=True)

# Persistent volume for vLLM cache
vllm_cache_volume = modal.Volume.from_name("vllm-cache", create_if_missing=True)


@app.function(
    image=image,
    gpu="H100",  # or "A100-40GB", "A10G" for cheaper
    volumes={
        "/root/.cache/huggingface": model_volume,
        "/models": merged_volume,
        "/vllm-cache": vllm_cache_volume,
    },
    timeout=86400,  # 24 hours (service runs indefinitely)
    memory=32768,
    scaledown_window=300,  # Keep warm for 5 min after last request
    # Allow concurrent requests
    concurrency_limit=100,
)
@modal.web_server(port=8000, startup_timeout=300)
def vllm_server(model_path: str = "/models/merged-model", model_name: str = "lattice-1", tensor_parallel_size: int = 1):
    """Launch vLLM OpenAI-compatible server."""
    import subprocess
    import os
    
    # Verify model exists
    if not os.path.exists(model_path):
        # Try to find it
        for root, dirs, files in os.walk("/models"):
            if "config.json" in files:
                model_path = root
                break
    
    print(f"Starting vLLM server with model: {model_path}")
    print(f"Model name: {model_name}")
    print(f"Tensor parallel size: {tensor_parallel_size}")
    
    cmd = [
        "python", "-m", "vllm.entrypoints.openai.api_server",
        "--model", model_path,
        "--served-model-name", model_name,
        "--host", "0.0.0.0",
        "--port", "8000",
        "--tensor-parallel-size", str(tensor_parallel_size),
        "--max-model-len", "8192",
        "--gpu-memory-utilization", "0.9",
        "--trust-remote-code",
        "--disable-log-requests",
        "--enable-prefix-caching",
    ]
    
    # Set environment for vLLM
    os.environ["VLLM_CACHE_DIR"] = "/vllm-cache"
    
    subprocess.run(cmd)


@app.local_entrypoint()
def deploy(model_path: str = "/models/merged-model", model_name: str = "lattice-1", gpu: str = "H100", tp: int = 1):
    """Deploy vLLM server.
    
    Example:
        modal run vllm_deploy.py --model-path /models/merged-model --model-name lattice-1 --gpu H100
        modal run vllm_deploy.py --gpu A10G --tp 1  # Cheaper option
    """
    print(f"Deploying {model_name} on {gpu} with tensor_parallel={tp}")
    print(f"Model path: {model_path}")
    print("Server will be available at the Modal app URL")
    print("Use `modal serve vllm_deploy.py` for persistent deployment")
    
    # For persistent deployment, use modal serve
    # This just validates the config
    print("\nTo deploy persistently, run:")
    print(f"  modal serve vllm_deploy.py --model-path {model_path} --model-name {model_name} --gpu {gpu} --tp {tp}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--help":
        print(__doc__)
        print("\nOptions:")
        print("  --model-path    Path to merged model (default: /models/merged-model)")
        print("  --model-name    Name to serve as (default: lattice-1)")
        print("  --gpu           GPU type: H100, A100-40GB, A10G (default: H100)")
        print("  --tp            Tensor parallel size (default: 1)")