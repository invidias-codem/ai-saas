import functions_framework
import requests
import opik
import os
import json

# Setup Opik
# Ensure OPIK_API_KEY and OPIK_WORKSPACE are set in env
opik.configure(use_local=False)

SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")

@functions_framework.http
def genie_doctor(request):
    """
    The Doctor: Receives fatal errors, logs them to Opik, and alerts Slack.
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return "Empty payload", 400

        error_msg = data.get("error", "Unknown Failed Error")
        source = data.get("source", "Unknown Source")
        traceback_str = data.get("traceback", "No traceback")
        original_payload = data.get("original_payload", {})

        print(f"🩺 Doctor received patient from {source}: {error_msg}")

        # 1. Log to Opik (Medical Record)
        # We manually log a trace for the Doctor's diagnosis
        try:
            client = opik.Opik()
            trace = client.trace(
                name="genie_doctor_diagnosis",
                input={"error": error_msg, "source": source, "payload": original_payload},
                output={"diagnosis": "Fatal Error", "prescription": "Alert & Drop"}
            )
            trace.log_feedback_score(name="severity", value=1.0, reason="Fatal Crash")
            trace.end()
        except Exception as opik_error:
            print(f"⚠️ Opik logging failed: {opik_error}")

        # 2. Slack Alert (PagerDuty style)
        if SLACK_WEBHOOK_URL:
            slack_msg = {
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": "🚨 System Failure Detected",
                            "emoji": True
                        }
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Source:*\n`{source}`"},
                            {"type": "mrkdwn", "text": f"*Error:*\n`{error_msg}`"}
                        ]
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*Traceback:*\n```{traceback_str[:1000]}...```"
                        }
                    }
                ]
            }
            try:
                requests.post(SLACK_WEBHOOK_URL, json=slack_msg, timeout=5)
            except Exception as slack_error:
                print(f"⚠️ Slack alert failed: {slack_error}")
        else:
            print("⚠️ No SLACK_WEBHOOK_URL set. Skipping alert.")

        return "Diagnosed", 200

    except Exception as e:
        print(f"💀 CRITICAL: Doctor crashed! {e}")
        return "Doctor Crashed", 500
