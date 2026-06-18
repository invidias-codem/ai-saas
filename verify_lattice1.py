#!/usr/bin/env python3
"""
Verify Lattice-1 merged model and test with vLLM locally (if GPU available)
or prepare for Modal deployment.
"""

import os
import subprocess
import sys
from pathlib import Path


def verify_merged_model(model_path: str) -> bool:
    """Verify merged model has all required files."""
    path = Path(model_path)
    
    required_files = [
        "config.json",
        "model.safetensors.index.json",
        # Or single file
    ]
    
    # Check for either sharded or single model file
    safetensors_files = list(path.glob("*.safetensors"))
    has_model = len(safetensors_files) > 0 or (path / "pytorch_model.bin").exists()
    
    required = ["config.json", "tokenizer.json", "tokenizer_config.json"]
    # Note: tokenizer files are copied with --copy-tokenizer
    
    print(f"Checking model at: {path}")
    print(f"  Exists: {path.exists()}")
    
    if not path.exists():
        print("  ❌ Model directory not found")
        return False
    
    for f in required:
        exists = (path / f).exists()
        print(f"  {f}: {'✅' if exists else '❌'}")
    
    print(f"  Model weights: {len(safetensors_files)} safetensors file(s)")
    
    # Check config
    config_path = path / "config.json"
    if config_path.exists():
        import json
        with open(config_path) as f:
            config = json.load(f)
        print(f"  Architecture: {config.get('architectures', ['unknown'])}")
        print(f"  Hidden size: {config.get('hidden_size', 'unknown')}")
        print(f"  Num layers: {config.get('num_hidden_layers', 'unknown')}")
        print(f"  Vocab size: {config.get('vocab_size', 'unknown')}")
    
    return has_model and all((path / f).exists() for f in required)


def test_with_vllm(model_path: str, prompt: str = "Write a haiku about Rust") -> bool:
    """Quick test with vLLM if available."""
    try:
        from vllm import LLM, SamplingParams
        
        print(f"\nLoading model with vLLM...")
        llm = LLM(
            model=model_path,
            tensor_parallel_size=1,
            max_model_len=8192,
            gpu_memory_utilization=0.9,
            trust_remote_code=True,
            enforce_eager=True,  # Faster startup for testing
        )
        
        params = SamplingParams(
            temperature=0.7,
            max_tokens=100,
            top_p=0.95,
        )
        
        print(f"Generating: {prompt}")
        outputs = llm.generate([prompt], params)
        
        for output in outputs:
            print(f"Response: {output.outputs[0].text}")
        
        return True
        
    except ImportError:
        print("vLLM not installed. Skipping generation test.")
        return False
    except Exception as e:
        print(f"vLLM test failed: {e}")
        return False


def test_with_transformers(model_path: str, prompt: str = "Write a haiku about Rust") -> bool:
    """Fallback test with transformers (CPU, slow)."""
    try:
        from transformers import AutoTokenizer, AutoModelForCausalLM
        import torch
        
        print(f"\nLoading model with transformers (CPU)...")
        tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
        
        # Load in 4-bit for CPU testing
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            device_map="auto",
            torch_dtype=torch.float16,
            trust_remote_code=True,
            load_in_4bit=True,
        )
        
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        
        print(f"Generating...")
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=100,
                temperature=0.7,
                do_sample=True,
                top_p=0.95,
                pad_token_id=tokenizer.eos_token_id,
            )
        
        response = tokenizer.decode(outputs[0], skip_special_tokens=True)
        print(f"Response: {response}")
        
        return True
        
    except Exception as e:
        print(f"Transformers test failed: {e}")
        return False


def main():
    # Default path from Modal output volume
    model_path = "/output/merged-model"
    
    if len(sys.argv) > 1:
        model_path = sys.argv[1]
    
    print("=" * 60)
    print("Lattice-1 Model Verification")
    print("=" * 60)
    
    # Verify model structure
    if not verify_merged_model(model_path):
        print("\n❌ Model verification failed")
        sys.exit(1)
    
    print("\n✅ Model structure verified")
    
    # Test generation if possible
    print("\n" + "=" * 60)
    print("Generation Test")
    print("=" * 60)
    
    # Try vLLM first (if GPU), then transformers
    if test_with_vllm(model_path):
        print("✅ vLLM test passed")
    elif test_with_transformers(model_path):
        print("✅ Transformers test passed")
    else:
        print("⚠️  Could not test generation (no GPU/transformers issue)")
        print("   Deploy to Modal vLLM for full test")
    
    print("\n" + "=" * 60)
    print("Next Steps")
    print("=" * 60)
    print("1. Deploy to Modal vLLM: modal serve vllm_deploy.py")
    print("2. Set LATTICE1_BASE_URL in Hermes")
    print("3. Load skill: hermes skill load hermes_skills/lattice1")
    print("4. Test: lattice1_chat with coding prompt")


if __name__ == "__main__":
    main()