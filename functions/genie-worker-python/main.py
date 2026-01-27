import functions_framework
from flask import jsonify
import logging
import os
import requests
import json
import opik
import traceback
import base64
from supabase import create_client, Client
from google import genai
from google.genai import types

# Setup Logging
logging.basicConfig(level=logging.INFO)

# Define custom exceptions
class TransientError(Exception): pass
class FatalError(Exception): pass

# Define Retryable Errors (Let Cloud Tasks handle these)
RETRIABLE_ERRORS = (
    ConnectionError, 
    TimeoutError,
    TransientError,
    # Add specific Gemini RateLimitError if imported
)

# Doctor URL (Env Var)
GENIE_DOCTOR_URL = os.environ.get("GENIE_DOCTOR_URL", "")

# Slack Webhook URL (Env Var recommended)
SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")

# Gemini Client (Lazy Init if needed, but function instances usually persist)
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logging.warning("⚠️ GOOGLE_API_KEY not found. Gemini calls will fail.")

def get_genai_client():
    # Use Vertex AI for GCS support (Big Data)
    project_id = os.environ.get("GCP_PROJECT_ID")
    location = os.environ.get("GCP_REGION", "us-central1")
    
    if project_id:
        logging.info(f"🔌 Initializing Vertex AI Client ({project_id})...")
        return genai.Client(vertexai=True, project=project_id, location=location)
    
    # Fallback to AI Studio (Key-based) if no Project ID
    if not GOOGLE_API_KEY:
        raise FatalError("Missing GOOGLE_API_KEY and GCP_PROJECT_ID")
    return genai.Client(api_key=GOOGLE_API_KEY)

@functions_framework.http
@opik.track(name="genie_worker_entrypoint")
def genie_worker(request):
    try:
        data = request.get_json(silent=True)
        if not data:
            raise FatalError("Empty payload received")

        # 1. Extract inputs
        conversation_id = data.get('conversationId')
        user_id = data.get('userId')
        prompt = data.get('prompt')
        file_data = data.get('fileData') # { name, type, base64Data }
        chaos = data.get("chaos")

        logging.info(f"🚀 Worker started. User={user_id}, Conv={conversation_id}, HasFile={bool(file_data)}")

        # Chaos testing
        if os.environ.get("ENABLE_CHAOS_TESTING") == "true":
            if chaos == "transient":
                raise TransientError("Simulated Rate Limit (Chaos Test)")
            if chaos == "fatal":
                raise FatalError("Simulating Corrupt Data (Chaos Test)")
        
        if not prompt:
             raise FatalError("Missing 'prompt' in payload")

        # 2. Initialize Supabase
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

        if not supabase_url or not supabase_key:
            raise FatalError("Missing Supabase Configuration")

        supabase: Client = create_client(supabase_url, supabase_key)

        # 3. RUN AGENT LOGIC (Gemini)
        client = get_genai_client()
        model_id = "gemini-2.0-flash-exp" # Using Flash for speed

        contents = []
        
        # Add Text Prompt
        if prompt:
             contents.append(prompt)

        # Add File if present
        if file_data:
            try:
                mime_type = file_data.get('type', 'application/octet-stream')
                
                if file_data.get('fileUri'):
                    # GCS URI (Large File)
                    file_uri = file_data['fileUri']
                    file_part = types.Part.from_uri(file_uri=file_uri, mime_type=mime_type)
                    contents.append(file_part)
                    logging.info(f"📎 Attached GCS file: {file_data.get('name')} ({file_uri})")
                
                elif file_data.get('base64Data'):
                    # Base64 (Small File)
                    blob = base64.b64decode(file_data['base64Data'])
                    file_part = types.Part.from_bytes(data=blob, mime_type=mime_type)
                    contents.append(file_part)
                    logging.info(f"📎 Attached Base64 file: {file_data.get('name')}")
            except Exception as e:
                logging.error(f"Failed to process file attachment: {e}")
                # We continue without the file rather than crashing the whole request
                contents.append(f"[System Error: Failed to attach file {file_data.get('name')}]")

        generate_config = types.GenerateContentConfig(
            temperature=0.7,
            max_output_tokens=2048,
        )

        try:
            logging.info(f"🧠 Calling Gemini ({model_id})...")
            response = client.models.generate_content(
                model=model_id,
                contents=contents,
                config=generate_config
            )
            ai_response_text = response.text
            logging.info("🧠 Gemini Response Received")

        except Exception as gemini_err:
             logging.error(f"Gemini API Error: {gemini_err}")
             # Raise specific error so we know if it's transient
             raise FatalError(f"Gemini Inference Failed: {gemini_err}")

        
        # 4. Write to Supabase (Realtime)
        from datetime import datetime, timezone
        
        message_payload = {
            "conversation_id": conversation_id,
            "role": "bot",
            "content": ai_response_text,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        try:
            db_res = supabase.table("messages").insert(message_payload).execute()
            logging.info(f"✅ Response saved to Supabase")
        except Exception as db_err:
             raise FatalError(f"Database Write Failed: {db_err}")
        
        logging.info("✅ Worker finished successfully")
        return jsonify({"status": "success", "written_to_db": True}), 200

    except RETRIABLE_ERRORS as e:
        # ⚠️ CRITICAL: Raise 500 so Cloud Tasks retries automatically
        logging.warning(f"🔄 Transient Error: {str(e)}")
        return jsonify({"error": str(e), "retry": True}), 500

    except Exception as e:
        # 🛑 FATAL: Call the Doctor, then kill the task (200 OK)
        logging.error(f"🚑 Fatal Error: {str(e)}. Calling Doctor...")
        
        # Sanitize payload - remove sensitive data before sending to doctor
        safe_payload = {
            "conversationId": data.get('conversationId') if 'data' in locals() else None,
            "userId": data.get('userId') if 'data' in locals() else None,
            "hasFile": bool(data.get('fileData')) if 'data' in locals() else False,
            # Exclude prompt and fileData to prevent PII leakage
        }
        doctor_payload = {
            "error": str(e),
            "traceback": traceback.format_exc(),
            "original_payload": safe_payload,
            "source": "genie-worker"
        }
        
        if GENIE_DOCTOR_URL:
            try:
                requests.post(GENIE_DOCTOR_URL, json=doctor_payload, timeout=5)
            except Exception:
                pass
        
        return jsonify({"status": "Handled by Doctor", "error": str(e)}), 200
