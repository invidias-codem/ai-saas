import functions_framework
from flask import jsonify
import logging
import os
import requests
import json

# Setup Logging
logging.basicConfig(level=logging.INFO)

# Define custom exceptions
class TransientError(Exception): pass
class FatalError(Exception): pass

# Slack Webhook URL (Env Var recommended)
SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")

def send_slack_alert(message):
    """Sends a critical alert to Slack"""
    if not SLACK_WEBHOOK_URL:
        logging.warning("⚠️ No SLACK_WEBHOOK_URL set. Skipping alert.")
        return
    
    try:
        payload = {"text": f"🚨 *Genie Worker Alert* 🚨\n{message}"}
        requests.post(SLACK_WEBHOOK_URL, json=payload, timeout=5)
    except Exception as e:
        logging.error(f"Failed to send Slack alert: {e}")

@functions_framework.http
def genie_worker(request):
    try:
        data = request.get_json(silent=True)
        if not data:
            raise FatalError("Empty payload received")

        logging.info(f"🚀 Worker started. Payload: {json.dumps(data)}")

        # --- CHAOS TESTING START ---
        if data.get("chaos") == "transient":
            raise TransientError("Simulating Rate Limit (Chaos Test)")
        if data.get("chaos") == "fatal":
            raise FatalError("Simulating Corrupt Data (Chaos Test)")
        # --- CHAOS TESTING END ---

        # 1. Extract inputs
        prompt = data.get('prompt')
        user_id = data.get('userId')
        
        if not prompt:
             raise FatalError("Missing 'prompt' in payload")

        # 2. RUN AGENT LOGIC HERE (Stub)
        # This is where we would call Gemini, Vector DB, etc.
        # simulate_heavy_processing()
        result = f"Processed: {prompt}"
        
        logging.info("✅ Worker finished successfully")
        return jsonify({"status": "success", "result": result}), 200

    except TransientError as e:
        # HTTP 500 tells Cloud Tasks: "Something broke, but might work later. Please retry."
        logging.warning(f"⚠️ TRANSIENT ERROR: {str(e)}")
        return jsonify({"error": str(e), "retry": True}), 500

    except FatalError as e:
        # HTTP 200 tells Cloud Tasks: "I processed this (by failing gracefully). Do NOT retry."
        logging.error(f"🛑 FATAL ERROR: {str(e)}")
        
        # Alerting
        try:
            send_slack_alert(f"Fatal Error processing job: {str(e)}")
        except Exception as alert_error:
            logging.error(f"⚠️ Failed to send Slack alert: {alert_error}")
        
        # TODO: Update DB status to 'FAILED'
        
        return jsonify({"error": str(e), "retry": False}), 200

    except Exception as e:
        # Catch-all for unexpected bugs -> Treat as Transient (safer)
        logging.exception(f"🔥 UNEXPECTED ERROR: {str(e)}")
        return jsonify({"error": "Internal Server Error"}), 500
