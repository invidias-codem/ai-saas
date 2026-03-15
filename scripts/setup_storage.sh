#!/bin/bash

# Load env vars
if [ -f ../.env.local ]; then
    export $(cat ../.env.local | grep -v '#' | awk '/=/ {print $1}')
fi

PROJECT_ID=${GCP_PROJECT_ID:-"genie-ai-1ca85"}
REGION=${GCP_REGION:-"us-central1"}

UPLOADS_BUCKET="genie-uploads-${PROJECT_ID}"
PROCESSED_BUCKET="genie-processed-${PROJECT_ID}"

echo "🚀 Setting up Storage for Project: $PROJECT_ID"

# 1. Create Buckets
echo "Creating Bucket: gs://$UPLOADS_BUCKET ..."
gcloud storage buckets create gs://$UPLOADS_BUCKET --project=$PROJECT_ID --location=$REGION --uniform-bucket-level-access || echo "Bucket likely exists"

echo "Creating Bucket: gs://$PROCESSED_BUCKET ..."
gcloud storage buckets create gs://$PROCESSED_BUCKET --project=$PROJECT_ID --location=$REGION --uniform-bucket-level-access || echo "Bucket likely exists"

# 2. Configure CORS
echo "Configuring CORS..."
gcloud storage buckets update gs://$UPLOADS_BUCKET --cors-file=scripts/gcs_cors.json
gcloud storage buckets update gs://$PROCESSED_BUCKET --cors-file=scripts/gcs_cors.json

echo "✅ Storage Setup Complete!"
echo "Uploads: gs://$UPLOADS_BUCKET"
echo "Processed: gs://$PROCESSED_BUCKET"
