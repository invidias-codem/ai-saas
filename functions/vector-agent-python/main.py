import os
import logging
import time
import functions_framework
from flask import jsonify
from dotenv import load_dotenv
from engagement_brain import EngagementBrain
from social_agent import SocialAgent

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load .env.local from project root (2 dirs up) for local dev
env_path = os.path.join(os.path.dirname(__file__), '../../.env.local')
load_dotenv(env_path)

# Initialize Brain (lazy)
api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    logger.warning("GOOGLE_API_KEY not set. Brain will fail.")

brain: EngagementBrain | None = None
social: SocialAgent | None = None

def get_brain() -> EngagementBrain:
    global brain
    if brain is None:
        if not api_key:
            raise ValueError("GOOGLE_API_KEY is required but not configured")
        brain = EngagementBrain(api_key=api_key)
    return brain

def get_social() -> SocialAgent:
    global social
    if social is None:
        social = SocialAgent()
    return social


@functions_framework.http
def vector_agent(request):
    """
    Vector Agent Entrypoint (HTTP).

    Actions:
      analyze  — Analyze a list of posts for sentiment/trending topics
      engage   — Decide how to respond to a single post (no side-effects)
      run      — Full autonomous loop: search Bluesky → decide → act (like/reply)
      post_geo — Generate + publish a localized post for a restricted-access region
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400

        action = data.get("action", "analyze")
        logger.info(f"🧠 Vector Agent Triggered: {action}")

        # ── ANALYZE ──────────────────────────────────────────────────────────
        if action == "analyze":
            posts = data.get("posts", [])
            if not posts:
                posts = ["AI is taking over the world!", "I love coding in Python.", "Genie is looking cool."]
            analysis = get_brain().analyze_social_economy(posts)
            return jsonify({"status": "success", "analysis": analysis}), 200

        # ── ENGAGE (decision only, no side-effects) ──────────────────────────
        elif action == "engage":
            post_text = data.get("post_text")
            author = data.get("author", "unknown")
            context = data.get("context", "")
            if not post_text:
                return jsonify({"error": "Missing post_text"}), 400
            decision = get_brain().decide_engagement(post_text, author, context)
            return jsonify({"status": "success", "decision": decision}), 200

        # ── RUN (autonomous loop: search → decide → act) ─────────────────────
        elif action == "run":
            keywords = data.get("keywords", [
                "AI SaaS", "ChatGPT alternative", "Slack AI",
                "AI assistant", "LLM tools", "build with AI"
            ])
            dry_run = data.get("dry_run", False)
            limit = data.get("limit", 10)

            brain_inst = get_brain()
            social_inst = get_social()

            if not dry_run and not social_inst.connect():
                return jsonify({"error": "Bluesky connection failed — check BLUESKY_HANDLE and BLUESKY_PASSWORD"}), 500

            results = []
            processed = 0
            # ── Anti-spam hard caps ───────────────────────────────────────────
            MAX_REPLIES_PER_RUN = 2
            MAX_LIKES_PER_RUN   = 1
            MIN_CONFIDENCE      = 8   # 0-10; only act if brain is very sure
            replies_sent = 0
            likes_sent   = 0

            for keyword in keywords:
                logger.info(f"🔍 Searching: '{keyword}'")
                posts = social_inst.search_posts(keyword, limit=limit)

                for post in posts:
                    if processed >= 30:  # Safety cap per run
                        break

                    try:
                        post_text = post.record.text if hasattr(post.record, "text") else ""
                        author = post.author.handle if hasattr(post, "author") else "unknown"

                        if not post_text:
                            continue

                        decision = brain_inst.decide_engagement(post_text, author, keyword)
                        action_taken = decision.get("action", "IGNORE")
                        reply_text = decision.get("reply_text", "")
                        confidence = decision.get("confidence", 0)

                        # Gate: skip low-confidence decisions
                        if action_taken != "IGNORE" and confidence < MIN_CONFIDENCE:
                            logger.info(f"⏭️ Skipping low-confidence ({confidence}/10) action on @{author}")
                            action_taken = "IGNORE"

                        # Gate: enforce hard caps
                        if action_taken in ("REPLY", "BOTH") and replies_sent >= MAX_REPLIES_PER_RUN:
                            logger.info(f"🛑 Reply cap reached ({MAX_REPLIES_PER_RUN}), skipping @{author}")
                            action_taken = "LIKE" if likes_sent < MAX_LIKES_PER_RUN else "IGNORE"
                        if action_taken in ("LIKE", "BOTH") and likes_sent >= MAX_LIKES_PER_RUN:
                            action_taken = "IGNORE" if action_taken == "LIKE" else "REPLY"

                        result = {
                            "author": author,
                            "post_preview": post_text[:80],
                            "decision": action_taken,
                            "confidence": confidence,
                            "reply": reply_text,
                            "dry_run": dry_run,
                        }

                        if not dry_run:
                            if action_taken in ("LIKE", "BOTH"):
                                social_inst.like_post(post.uri, post.cid)
                                likes_sent += 1

                            if action_taken in ("REPLY", "BOTH") and reply_text:
                                social_inst.reply_to_post(post, reply_text)
                                replies_sent += 1

                            time.sleep(3)  # Slower cadence — safer

                        results.append(result)
                        processed += 1

                    except Exception as e:
                        logger.warning(f"Skipped post due to error: {e}")
                        continue

            logger.info(f"📊 Run summary: {replies_sent} replies, {likes_sent} likes out of {processed} posts scanned")

            # Also check notifications (mentions/replies to us)
            if not dry_run:
                notifs = social_inst.check_notifications(limit=10)
                for notif in notifs:
                    try:
                        post_text = notif.record.text if hasattr(notif.record, "text") else ""
                        author = notif.author.handle if hasattr(notif, "author") else "unknown"
                        if not post_text:
                            continue
                        decision = brain_inst.decide_engagement(post_text, author, f"mention/reply from @{author}")
                        confidence = decision.get("confidence", 0)
                        if decision.get("action") in ("REPLY", "BOTH") and decision.get("reply_text") and confidence >= MIN_CONFIDENCE and replies_sent < MAX_REPLIES_PER_RUN:
                            social_inst.reply_to_post(notif, decision["reply_text"])
                            replies_sent += 1
                            time.sleep(3)
                    except Exception as e:
                        logger.warning(f"Skipped notification: {e}")

            return jsonify({
                "status": "success",
                "processed": processed,
                "results": results,
            }), 200

        # ── POST_GEO (generate + publish localized post for restricted regions) ─
        elif action == "post_geo":
            region = data.get("region")
            dry_run = data.get("dry_run", False)

            if not region:
                return jsonify({
                    "error": "Missing 'region'. Options: russia, iran, china, middle_east, north_africa, sub_saharan_africa, southeast_asia, latin_america"
                }), 400

            geo_post = get_brain().generate_geo_post(region)

            if not geo_post or not geo_post.get("text"):
                return jsonify({"error": f"Failed to generate post for region: {region}"}), 500

            post_text = geo_post["text"]
            cid = None

            if not dry_run:
                social_inst = get_social()
                cid = social_inst.post_thought(post_text)

            return jsonify({
                "status": "success",
                "region": region,
                "language": geo_post.get("language"),
                "text": post_text,
                "published": not dry_run,
                "cid": cid,
            }), 200

        else:
            return jsonify({"error": f"Unknown action: '{action}'. Valid: analyze, engage, run, post_geo"}), 400

    except Exception as e:
        logger.error(f"Vector Agent Error: {e}")
        return jsonify({"error": "An internal error occurred. Please try again."}), 500


if __name__ == "__main__":
    print("--- 🧠 Running Vector Agent (Local Test) ---")
    # Quick local test: generate a geo post for russia (dry run)
    b = EngagementBrain(api_key=os.environ.get("GOOGLE_API_KEY", ""))
    result = b.generate_geo_post("russia")
    print(result)
