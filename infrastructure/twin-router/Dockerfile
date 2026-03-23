FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn httpx
COPY personas.py main.py ./
ENV VLLM_URL=http://genie-llm:8000
ENV VLLM_MODEL=NousResearch/Hermes-3-Llama-3.1-8B
ENV TWIN_TIMEOUT=120
ENV PORT=8002
EXPOSE 8002
CMD ["python", "main.py"]
