#!/bin/bash

# Configuration
PROJECT_ID="genie-ai-1ca85"
REGION="us-central1"
AGENT_NAME="vector-agent"

echo "🧠 Deploying Vector Agent..."

# Load env vars from .env.local
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '#' | awk '/=/ {print $1}')
fi

# Check logic for Python Runtime (3.12 verified locally)
cd functions/vector-agent-python
gcloud functions deploy $AGENT_NAME \
    --gen2 \
    --runtime=python312 \
    --region=$REGION \
    --source=. \
    --entry-point=vector_agent \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars GOOGLE_API_KEY="${GOOGLE_API_KEY}" \
    --project=$PROJECT_ID

echo "✅ Vector Agent deployed!"
cd ../..
