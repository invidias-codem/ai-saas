#!/bin/bash

# Configuration
PROJECT_ID="genie-ai-1ca85" # REPLACE WITH YOUR PROJECT ID
REGION="us-central1"
QUEUE_NAME="genie-worker-queue"
WORKER_NAME="genie-worker"
SERVICE_ACCOUNT_NAME="genie-dispatcher-sa"

echo "🚀 Setting up Cloud Tasks & Worker for Project: $PROJECT_ID"

# 1. Enable APIs
gcloud services enable cloudtasks.googleapis.com cloudfunctions.googleapis.com run.googleapis.com --project=$PROJECT_ID

# 2. Create Service Account for Next.js Dispatcher
echo "Creating Service Account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME --display-name="Next.js Dispatcher SA" --project=$PROJECT_ID

# 3. Create Cloud Task Queue
echo "Creating Queue..."
gcloud tasks queues create $QUEUE_NAME --location=$REGION --project=$PROJECT_ID

# 4. Deploy Python Worker (Cloud Function Gen 2)
echo "Deploying Worker..."
cd functions/genie-worker-python
gcloud functions deploy $WORKER_NAME \
    --gen2 \
    --runtime=python311 \
    --region=$REGION \
    --source=. \
    --entry-point=genie_worker \
    --trigger-http \
    --allow-unauthenticated \
    --project=$PROJECT_ID

# 5. Grant Permissions
# Allow Next.js SA to enqueue tasks
gcloud tasks queues add-iam-policy-binding $QUEUE_NAME \
    --location=$REGION \
    --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudtasks.enqueuer" \
    --project=$PROJECT_ID

# Allow Next.js SA to invoke the Cloud Function (OIDC)
gcloud functions add-iam-policy-binding $WORKER_NAME \
    --region=$REGION \
    --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/run.invoker" \
    --project=$PROJECT_ID

echo "✅ Setup Complete!"
echo "Service Account Email: $SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"
echo "Update your .env.local with GCP_SERVICE_ACCOUNT_EMAIL"
