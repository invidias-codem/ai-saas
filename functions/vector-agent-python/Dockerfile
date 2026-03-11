FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run sets the PORT env var (defaults to 8080)
CMD exec functions-framework --target=vector_agent --port=$PORT
