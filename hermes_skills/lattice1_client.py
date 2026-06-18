#!/usr/bin/env python3
"""
Hermes skill for Lattice-1 model integration.
Provides OpenAI-compatible client for the vLLM-deployed Lattice-1 model.
"""

import os
import httpx
from typing import Optional, List, Dict, Any
from openai import AsyncOpenAI


class Lattice1Client:
    """Client for Lattice-1 model via vLLM OpenAI-compatible endpoint."""
    
    def __init__(
        self,
        base_url: str = None,
        api_key: str = "lattice-1-local",  # vLLM doesn't require real key
        timeout: float = 60.0,
    ):
        self.base_url = base_url or os.getenv("LATTICE1_BASE_URL", "http://localhost:8000/v1")
        self.api_key = api_key
        self.timeout = timeout
        self._client: Optional[AsyncOpenAI] = None
    
    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                base_url=self.base_url,
                api_key=self.api_key,
                timeout=self.timeout,
                http_client=httpx.AsyncClient(timeout=self.timeout),
            )
        return self._client
    
    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = "lattice-1",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stream: bool = False,
        **kwargs,
    ) -> Dict[str, Any]:
        """Call Lattice-1 for chat completion."""
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
            **kwargs,
        )
        return response.model_dump() if not stream else response
    
    async def completion(
        self,
        prompt: str,
        model: str = "lattice-1",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs,
    ) -> Dict[str, Any]:
        """Call Lattice-1 for text completion."""
        response = await self.client.completions.create(
            model=model,
            prompt=prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )
        return response.model_dump()
    
    async def list_models(self) -> List[str]:
        """List available models."""
        models = await self.client.models.list()
        return [m.id for m in models.data]
    
    async def health_check(self) -> bool:
        """Check if vLLM server is healthy."""
        try:
            models = await self.list_models()
            return len(models) > 0
        except Exception:
            return False
    
    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.close()
            self._client = None


# Convenience function for Hermes tool integration
async def lattice1_chat(
    messages: List[Dict[str, str]],
    model: str = "lattice-1",
    temperature: float = 0.7,
    max_tokens: int = 4096,
    base_url: str = None,
) -> str:
    """
    Simple chat function for Hermes tool integration.
    
    Args:
        messages: List of {"role": "user|assistant|system", "content": "..."}
        model: Model name (default: lattice-1)
        temperature: Sampling temperature
        max_tokens: Max tokens in response
        base_url: vLLM server URL (default: from LATTICE1_BASE_URL env)
    
    Returns:
        Assistant response content as string
    """
    client = Lattice1Client(base_url=base_url)
    try:
        result = await client.chat_completion(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return result["choices"][0]["message"]["content"]
    finally:
        await client.close()


# Synchronous wrapper for non-async contexts
def lattice1_chat_sync(
    messages: List[Dict[str, str]],
    model: str = "lattice-1",
    temperature: float = 0.7,
    max_tokens: int = 4096,
    base_url: str = None,
) -> str:
    """Synchronous wrapper for lattice1_chat."""
    import asyncio
    return asyncio.run(lattice1_chat(messages, model, temperature, max_tokens, base_url))


if __name__ == "__main__":
    # Quick test
    import asyncio
    
    async def test():
        client = Lattice1Client()
        healthy = await client.health_check()
        print(f"Health check: {healthy}")
        if healthy:
            models = await client.list_models()
            print(f"Available models: {models}")
            response = await client.chat_completion([
                {"role": "user", "content": "Hello! Write a haiku about coding."}
            ])
            print(f"Response: {response['choices'][0]['message']['content']}")
        await client.close()
    
    asyncio.run(test())