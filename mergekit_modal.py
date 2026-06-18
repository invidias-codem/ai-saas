#!/usr/bin/env python3
"""
Run mergekit on Modal GPU for Lattice-1 model merging.
Usage: modal run mergekit_modal.py --config lattice-1-dare-ties.yaml
"""

import modal

app = modal.App("lattice-1-merge")

# GPU-enabled image with mergekit
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "git-lfs")
    .pip_install(
        "mergekit@git+https://github.com/arcee-ai/mergekit.git",
        "huggingface_hub[hf_transfer]",
        "safetensors",
        "torch",
        "transformers",
        "accelerate",
        "peft",
        gpu="any",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
    # Add config files to the image
    .add_local_file("mergekit-configs/lattice-1-dare-ties.yaml", "/root/mergekit-configs/lattice-1-dare-ties.yaml")
    .add_local_file("mergekit-configs/lattice-1-linear.yaml", "/root/mergekit-configs/lattice-1-linear.yaml")
)

# Volume for model cache (persists across runs)
model_volume = modal.Volume.from_name("hf-model-cache", create_if_missing=True)
output_volume = modal.Volume.from_name("lattice-1-output", create_if_missing=True)

CONFIG_MAP = {
    "dare-ties": "lattice-1-dare-ties.yaml",
    "linear": "lattice-1-linear.yaml",
}


@app.function(
    image=image,
    gpu="H100",  # or "A100", "A10G" for cheaper
    volumes={
        "/root/.cache/huggingface": model_volume,
        "/output": output_volume,
    },
    timeout=7200,  # 2 hours max
    memory=32768,  # 32GB RAM
)
def run_merge(config_name: str = "dare-ties", upload_to_hub: bool = False, hub_repo: str = None):
    import subprocess
    import os
    from pathlib import Path

    config_file = CONFIG_MAP.get(config_name, config_name)
    config_path = Path(__file__).parent / "mergekit-configs" / config_file

    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")

    print(f"Running mergekit with config: {config_file}")
    print(f"Config path: {config_path}")

    # Run mergekit - use mergekit-yaml which is the actual CLI entry point
    mergekit_cmd = "/usr/local/bin/mergekit-yaml"
    cmd = [mergekit_cmd, str(config_path), "/output/merged-model", "--copy-tokenizer"]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd="/output")

    print("STDOUT:", result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)

    if result.returncode != 0:
        raise RuntimeError(f"Merge failed with exit code {result.returncode}")

    # Verify output
    merged_path = Path("/output/merged-model")
    if merged_path.exists():
        print(f"Merge successful! Model at: {merged_path}")
        for f in merged_path.rglob("*"):
            if f.is_file():
                print(f"  {f.relative_to(merged_path)}: {f.stat().st_size / 1e9:.2f} GB")

    # Optionally upload to HuggingFace Hub
    if upload_to_hub and hub_repo:
        from huggingface_hub import HfApi
        api = HfApi()
        api.upload_folder(
            folder_path=str(merged_path),
            repo_id=hub_repo,
            repo_type="model",
            commit_message=f"Lattice-1 merge: {config_name}",
        )
        print(f"Uploaded to {hub_repo}")

    output_volume.commit()
    return {"status": "success", "path": str(merged_path)}


@app.local_entrypoint()
def main(config: str = "dare-ties", upload: bool = False, hub_repo: str = None):
    """Entry point for modal CLI.
    Example: modal run mergekit_modal.py --config dare-ties --upload --hub-repo username/lattice-1
    """
    result = run_merge.remote(config_name=config, upload_to_hub=upload, hub_repo=hub_repo)
    print(result)


if __name__ == "__main__":
    import sys
    # Allow running locally for testing (without modal decorator)
    if len(sys.argv) > 1 and sys.argv[1] == "--local":
        config = sys.argv[2] if len(sys.argv) > 2 else "linear"
        run_merge(config_name=config)
    else:
        print("Run with: modal run mergekit_modal.py --config dare-ties")
        print("Or locally (CPU only): python mergekit_modal.py --local linear")