FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run sets the PORT env var (defaults to 8080)
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
