import os
import requests
import time
import json
import base64
from google.cloud import storage
import google.auth
from datetime import datetime

# Configuration
PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "genie-ai-1ca85")
REGION = os.environ.get("GCP_REGION", "us-central1")
WORKER_URL = f"https://{REGION}-{PROJECT_ID}.cloudfunctions.net/genie-worker"
BUCKET_NAME = f"genie-uploads-{PROJECT_ID}"
TEST_FILENAME = "large_test_file.txt"
TEST_FILE_SIZE_MB = 50  # 50MB is large enough to prove streaming works vs instant RAM OOM on small instances

def create_large_file(filename, size_mb):
    """Creates a dummy file of specified size."""
    print(f"Generating {size_mb}MB test file: {filename}...")
    with open(filename, "wb") as f:
        # Write 1MB chunks
        chunk = b"A" * 1024 * 1024
        for _ in range(size_mb):
            f.write(chunk)
    print("File generated.")

def upload_to_gcs(bucket_name, source_file, destination_blob):
    """Uploads file to GCS."""
    print(f"Uploading {source_file} to gs://{bucket_name}/{destination_blob}...")
    storage_client = storage.Client(project=PROJECT_ID)
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(destination_blob)
    blob.upload_from_filename(source_file)
    print("Upload complete.")
    return f"gs://{bucket_name}/{destination_blob}"

def trigger_worker(file_uri, file_name):
    """Triggers the worker with the URI."""
    print(f"Triggering Worker at {WORKER_URL} with URI: {file_uri}")
    
    payload = {
        "conversationId": "test-big-data-" + str(int(time.time())),
        "userId": "test-user-admin",
        "prompt": "Summarize this large file briefly.",
        "fileData": {
            "name": file_name,
            "type": "text/plain",
            "fileUri": file_uri # The Key: Passing URI, not base64
        }
    }
    
    start_time = time.time()
    try:
        response = requests.post(
            WORKER_URL, 
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        duration = time.time() - start_time
        print(f"Worker responded in {duration:.2f}s")
        print(f"Status: {response.status_code}")
        print(f"Body: {response.text}")
        
        if response.status_code == 200:
            print("✅ TEST PASSED: Worker handled URI input successfully.")
            return True
        else:
            print("❌ TEST FAILED: Worker returned error.")
            return False
            
    except Exception as e:
        print(f"❌ TEST FAILED: Request Error: {e}")
        return False

def main():
    try:
        # 1. Generate Data
        create_large_file(TEST_FILENAME, TEST_FILE_SIZE_MB)
        
        # 2. Upload to GCS (Simulating Frontend Direct Upload)
        destination = f"tests/{int(time.time())}/{TEST_FILENAME}"
        gcs_uri = upload_to_gcs(BUCKET_NAME, TEST_FILENAME, destination)
        
        # 3. Trigger Worker
        success = trigger_worker(gcs_uri, TEST_FILENAME)
        
        # Cleanup
        if os.path.exists(TEST_FILENAME):
            os.remove(TEST_FILENAME)
            
    except Exception as e:
        print(f"Test failed with exception: {e}")

if __name__ == "__main__":
    main()
