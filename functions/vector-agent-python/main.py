import os
import logging
import functions_framework
from flask import jsonify
from dotenv import load_dotenv
from engagement_brain import EngagementBrain

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load .env.local from project root (2 dirs up)
env_path = os.path.join(os.path.dirname(__file__), '../../.env.local')
load_dotenv(env_path)

# Initialize Brain
# Note: User specified key is 'GOOGLE_API_KEY'
api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    logger.warning("GOOGLE_API_KEY not set in environment or ../../.env.local. Brain will fail.")

# Lazy initialization to allow graceful degradation
brain: EngagementBrain | None = None

def get_brain() -> EngagementBrain:
    global brain
    if brain is None:
        if not api_key:
            raise ValueError("GOOGLE_API_KEY is required but not configured")
        brain = EngagementBrain(api_key=api_key)
    return brain

@functions_framework.http
def vector_agent(request):
    """
    Vector Agent Entrypoint (HTTP).
    A simplified entrypoint to trigger the EngagementBrain.
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400

        action = data.get("action", "analyze")
        logger.info(f"🧠 Vector Agent Triggered: {action}")

        # 1. ANALYSIS MODE
        if action == "analyze":
            posts = data.get("posts", [])
            if not posts:
                # Stub data if none provided (for testing)
                posts = ["AI is taking over the world!", "I love coding in Python.", "Genie is looking cool."]
            
            analysis = get_brain().analyze_social_economy(posts)
            return jsonify({"status": "success", "analysis": analysis}), 200

        # 2. ENGAGEMENT MODE
        elif action == "engage":
            post_text = data.get("post_text")
            author = data.get("author", "unknown")
            context = data.get("context", "")
            
            if not post_text:
                return jsonify({"error": "Missing post_text"}), 400

            decision = get_brain().decide_engagement(post_text, author, context)
            return jsonify({"status": "success", "decision": decision}), 200

        else:
            return jsonify({"error": "Unknown action"}), 400

    except Exception as e:
        logger.error(f"Vector Agent Error: {e}")
        return jsonify({"error": "An internal error occurred. Please try again."}), 500

if __name__ == "__main__":
    # Local Test Loop
    print("--- 🧠 Running Vector Agent (Local Test) ---")
    mock_request = type('obj', (object,), {
        "get_json": lambda silent: {
            "action": "engage", 
            "post_text": "I think AI agents are the future of SaaS.",
            "author": "tech_guru"
        }
    })
    print(vector_agent(mock_request))
