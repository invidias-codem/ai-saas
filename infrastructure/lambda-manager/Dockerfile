FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY lambda_manager.py proxy.py ./
EXPOSE 8003
CMD ["uvicorn", "proxy:app", "--host", "0.0.0.0", "--port", "8003"]
