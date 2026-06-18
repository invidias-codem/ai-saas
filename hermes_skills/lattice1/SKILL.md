---
name: lattice1
description: "Lattice-1 custom model integration via vLLM OpenAI-compatible endpoint"
version: "0.1.0"
author: "Lattice OS Team"
category: "mlops/inference"
tags: ["lattice", "custom-model", "vllm", "openai-compatible", "hermes"]
requires:
  - openai>=1.0.0
  - httpx>=0.27.0
env_vars:
  - name: LATTICE1_BASE_URL
    description: "vLLM server base URL (e.g., https://xxx.modal.run/v1)"
    required: false
    default: "http://localhost:8000/v1"
  - name: LATTICE1_API_KEY
    description: "API key for vLLM (not required for local)"
    required: false
    default: "lattice-1-local"
tools:
  - name: lattice1_chat
    description: "Chat with Lattice-1 model (coding, reasoning, personality)"
    parameters:
      type: object
      properties:
        messages:
          type: array
          description: "Chat messages"
          items:
            type: object
            properties:
              role:
                type: string
                enum: ["system", "user", "assistant"]
              content:
                type: string
            required: ["role", "content"]
          required: true
        model:
          type: string
          description: "Model name"
          default: "lattice-1"
        temperature:
          type: number
          description: "Sampling temperature"
          default: 0.7
        max_tokens:
          type: integer
          description: "Max tokens in response"
          default: 4096
      required: ["messages"]
  - name: lattice1_health
    description: "Check Lattice-1 vLLM server health"
    parameters:
      type: object
      properties: {}
  - name: lattice1_models
    description: "List available models on Lattice-1 vLLM server"
    parameters:
      type: object
      properties: {}
---

# Lattice-1 Hermes Skill

This skill provides integration with the Lattice-1 custom model deployed via vLLM.

## Setup

1. Deploy Lattice-1 to vLLM on Modal:
   ```bash
   modal serve vllm_deploy.py --model-path /models/merged-model --model-name lattice-1 --gpu H100
   ```

2. Get the Modal HTTPS URL (e.g., `https://your-workspace--lattice-1-vllm-run.modal.run`)

3. Set environment variable:
   ```bash
   export LATTICE1_BASE_URL="https://your-workspace--lattice-1-vllm-run.modal.run/v1"
   ```

4. Load skill in Hermes:
   ```bash
   hermes skill load hermes_skills/lattice1_client.py
   ```

## Tools

### lattice1_chat
Chat with the Lattice-1 model optimized for:
- **Coding**: Claude-style careful, thorough code generation
- **Reasoning**: Gemini-style structured, multi-perspective analysis  
- **Personality**: GPT-5-style witty, conversational responses

```python
# Example usage in Hermes
result = await lattice1_chat(
    messages=[
        {"role": "system", "content": "You are Lattice-1, a coding assistant."},
        {"role": "user", "content": "Write a Rust async HTTP client with retries"}
    ],
    temperature=0.3,  # Lower for coding
    max_tokens=4096
)
```

### lattice1_health
Check if the vLLM server is healthy and model is loaded.

### lattice1_models
List available models on the server.

## Model Capabilities

Lattice-1 is a DARE-TIES merge of Qwen2.5-Coder-14B variants:
- **Base**: Qwen/Qwen2.5-Coder-14B (Apache 2.0)
- **Coding expert** (35%): Official instruct for code tasks
- **Reasoning expert** (30%): Official instruct for reasoning
- **Personality expert** (20%): Official instruct for chat
- **Breadth** (15%): Base model for general knowledge

## Cost Optimization

- **H100**: ~$2.50/hr, 80GB VRAM, handles full 14B bfloat16
- **A100-40GB**: ~$1.50/hr, needs 4-bit quantization
- **A10G**: ~$0.80/hr, needs 4-bit + offloading, slower

## Prompting Tips

For best results, use role-appropriate temperatures:
- **Coding**: 0.1-0.3 (deterministic, correct)
- **Reasoning**: 0.3-0.5 (structured, analytical)
- **Chat/Personality**: 0.7-0.9 (creative, conversational)

The model naturally routes based on task type — you don't need to specify which "expert" to use.