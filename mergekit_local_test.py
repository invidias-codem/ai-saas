#!/usr/bin/env python3
"""
Local CPU test merge using smaller model (Qwen2.5-Coder-7B).
Run this locally to verify configs work before cloud GPU run.
"""

import subprocess
import sys
from pathlib import Path

def run_local_merge(config_name: str = "linear", model_size: str = "7B"):
    """Run mergekit locally on CPU with smaller model."""
    config_map = {
        "linear": "lattice-1-linear.yaml",
        "dare-ties": "lattice-1-dare-ties.yaml",
    }

    config_file = config_map.get(config_name, config_name)
    config_path = Path(__file__).parent / "mergekit-configs" / config_file

    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")

    # Adjust base model for smaller size
    if model_size == "7B":
        # Create modified config on the fly
        import yaml
        with open(config_path) as f:
            config = yaml.safe_load(f)
        config["base_model"] = config["base_model"].replace("14B", "7B")
        config["out_path"] = f"./lattice-1-merged-{model_size.lower()}-{config_name}"

        # Update model references
        for m in config.get("models", []):
            m["model"] = m["model"].replace("14B", "7B").replace("2.5-14B", "2.5-7B").replace("qwen2-14b", "qwen2-7b")

        # Write modified config
        test_config_path = Path(f"/tmp/lattice-1-{model_size.lower()}-{config_name}.yaml")
        with open(test_config_path, "w") as f:
            yaml.dump(config, f)
        config_path = test_config_path

    output_path = Path(config_path).parent / f"lattice-1-merged-{model_size.lower()}-{config_name}"
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"Running local merge: {config_name} with {model_size} model")
    print(f"Config: {config_path}")
    print(f"Output: {output_path}")

    # mergekit CLI is mergekit-yaml in the venv
    mergekit_bin = "/Users/jjem/.hermes/hermes-agent/venv/bin/mergekit-yaml"
    cmd = [mergekit_bin, str(config_path), str(output_path), "--copy-tokenizer", "--lazy-unpickle"]
    result = subprocess.run(cmd, capture_output=True, text=True)

    print("STDOUT:", result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)

    if result.returncode != 0:
        print(f"Merge failed with exit code {result.returncode}")
        return False

    # Verify output
    if output_path.exists():
        print(f"Merge successful! Model at: {output_path}")
        for f in output_path.rglob("*"):
            if f.is_file():
                print(f"  {f.relative_to(output_path)}: {f.stat().st_size / 1e9:.2f} GB")
        return True

    return False


if __name__ == "__main__":
    config = sys.argv[1] if len(sys.argv) > 1 else "linear"
    size = sys.argv[2] if len(sys.argv) > 2 else "7B"

    print(f"Testing mergekit locally with {size} model, config: {config}")
    print("Note: This runs on CPU and will be slow. For production, use modal run mergekit_modal.py")
    print()

    success = run_local_merge(config, size)
    sys.exit(0 if success else 1)