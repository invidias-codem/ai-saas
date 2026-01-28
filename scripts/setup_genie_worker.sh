#!/bin/bash

# Configuration
PROJECT_ID="genie-ai-1ca85" # REPLACE WITH YOUR PROJECT ID
REGION="us-central1"
QUEUE_NAME="genie-worker-queue"
WORKER_NAME="genie-worker"
DOCTOR_NAME="genie-doctor"
SERVICE_ACCOUNT_NAME="genie-dispatcher-sa"

echo "🚀 Setting up Cloud Tasks & Worker for Project: $PROJECT_ID"

# Load env vars properly
if [ -f .env.local ]; then
    set -a  # automatically export all variables
    source .env.local
    set +a
fi

# 1. Enable APIs
gcloud services enable cloudtasks.googleapis.com cloudfunctions.googleapis.com run.googleapis.com --project=$PROJECT_ID

# 2. Create Service Account for Next.js Dispatcher
echo "Creating Service Account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME --display-name="Next.js Dispatcher SA" --project=$PROJECT_ID || true

# 3. Create Cloud Task Queue
echo "Creating Queue..."
gcloud tasks queues create $QUEUE_NAME --location=$REGION --project=$PROJECT_ID || true

# ---------------------------------------------------------
# 4. Deploy THE DOCTOR (First, so we have the URL)
# ---------------------------------------------------------
echo "👨‍⚕️ Deploying Genie Doctor..."
cd functions/genie-doctor-python
gcloud functions deploy $DOCTOR_NAME \
    --gen2 \
    --runtime=python311 \
    --region=$REGION \
    --source=. \
    --entry-point=genie_doctor \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars OPIK_API_KEY="${OPIK_API_KEY}",OPIK_WORKSPACE="${OPIK_WORKSPACE}",SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}" \
    --project=$PROJECT_ID

# Capture Doctor URL
DOCTOR_URL=$(gcloud functions describe $DOCTOR_NAME --region=$REGION --format='value(serviceConfig.uri)' --project=$PROJECT_ID)
echo "✅ Doctor is live at: $DOCTOR_URL"
cd ../..

# ---------------------------------------------------------
# 5. Deploy THE WORKER (With Doctor's Phone Number)
# ---------------------------------------------------------
echo "👷 Deploying Genie Worker..."
cd functions/genie-worker-python
gcloud functions deploy $WORKER_NAME \
    --gen2 \
    --runtime=python311 \
    --region=$REGION \
    --source=. \
    --entry-point=genie_worker \
    --trigger-http \
    --memory=1024MB \
    --allow-unauthenticated \
    --set-env-vars OPIK_API_KEY="${OPIK_API_KEY}",OPIK_WORKSPACE="${OPIK_WORKSPACE}",SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}",GENIE_DOCTOR_URL="${DOCTOR_URL}",ENABLE_CHAOS_TESTING="false",NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}",SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}",GOOGLE_API_KEY="${GOOGLE_API_KEY}",GCP_PROJECT_ID="${PROJECT_ID}",GCP_REGION="${REGION}" \
    --project=$PROJECT_ID
cd ../..

# 6. Grant Permissions
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

# 7. Grant Storage Permissions to Worker (Compute SA)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "Giving Storage Access to: $COMPUTE_SA"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/storage.objectViewer" || true

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/aiplatform.user" || true

# 8. Grant Storage Permissions to Vertex AI Service Agent (For Gemini File Reading)
# The Service Agent needs to be able to read the files you pass to it from GCS
VERTEX_SA="service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com"
echo "Giving Storage Access to Vertex AI Service Agent: $VERTEX_SA"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${VERTEX_SA}" \
    --role="roles/storage.objectViewer" || true

echo "✅ Setup Complete!"
echo "Service Account Email: $SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"
echo "Doctor URL: $DOCTOR_URL"
