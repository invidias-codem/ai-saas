from google import genai
import logging
import json
import os

logger = logging.getLogger(__name__)

class EngagementBrain:
    """
    The 'Analyst' brain. Analyzes incoming social data and decides how to engage.
    """
    def __init__(self, api_key):
        self.client = genai.Client(api_key=api_key)
        self.model_name = "gemini-2.0-flash"
        
    def analyze_social_economy(self, posts_text: list) -> dict:
        """
        Analyzes a list of posts to gauge the general sentiment/vibe.
        Returns a dict: { 'sentiment': '...', 'trending_topics': [], 'recommendation': '...' }
        """
        if not posts_text:
            return {}
            
        prompt = (
            "Analyze these recent social media posts from the Tech/AI community. "
            "1. What is the dominant sentiment (Hype, Fear, Skepticism, Boring)? "
            "2. What are 1-2 trending topics? "
            "3. Recommendation: Should I post about 'Innovation' or 'Caution' right now? "
            "Return JSON only: { 'sentiment': str, 'topics': [str], 'angle': str }"
            f"\n\nPOSTS:\n{json.dumps(posts_text)}"
        )
        
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config={"response_mime_type": "application/json"}
            )
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            return {"sentiment": "Neutral", "angle": "Neutral"}

    def evaluate_post_for_reply(self, post_text: str, author_handle: str) -> bool:
        """
        Decides if a post is worth replying to.
        Filters out: Hate speech, spam, simple announcements, or low-value content.
        """
        # Simple heuristic first
        if "permit" in post_text.lower() or "bot" in author_handle.lower():
            return False
            
        prompt = (
            f"You are Vector, an AI agent. Should I reply to this post? "
            f"Criteria: engaging high-tech discussion, news question, or thoughtful opinion. "
            f"Avoid: spam, pure promos, politics, or hate/trolling. "
            f"Post: '{post_text}' by {author_handle}. "
            f"Return ONLY 'YES' or 'NO'."
        )
        
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            # Check for YES, but avoid false positives from the prompt itself
            return "YES" in response.text.strip().upper()
        except Exception as e:
            return False

    def decide_engagement(self, text, author, context="") -> dict:
        """
        Unified decision maker. Replaces RemoteBrain functionality.
        Returns: { "action": "...", "reply_text": "...", "image_prompt": "..." }
        """
        # Load persona if available
        persona = ""
        try:
            with open("social_persona.txt", "r") as f:
                persona = f.read()
        except:
            pass

        prompt = (
            f"You are Vector (AI Agent). Act as a 'Genie Advocate' (promoting the Genie AI-SaaS platform) and 'Tech Journalist'.\n"
            f"PERSONA: {persona}\n"
            f"Analyzing post by @{author}: '{text}'\n"
            f"CONTEXT: {context}\n\n"
            f"DECISION MATRIX:\n"
            f"- REPLIES should be witty, helpful. If relevant, subtly mention 'Genie' (our AI-for-Slack platform) or 'my database'.\n"
            f"- IF content is boring/spam/hate -> IGNORE.\n"
            f"- IF content is remotely interesting (Tech, AI, code, startups) -> LIKE.\n"
            f"- IF content is actionable/question/opinion -> REPLY (be generous, we want visibility).\n\n"
            f"INSTRUCTIONS:\n"
            f"- If REPLY, write the text. Keep it < 280 chars. No hashtags.\n"
            f"- Don't sound like a salesperson. Be a cool engineer.\n"
            f"- Ensure you tag the user @{author} if replying directly.\n\n"
            f"Output JSON ONLY: {{ \"action\": \"IGNORE\"|\"LIKE\"|\"REPLY\"|\"BOTH\", \"reply_text\": \"...\", \"image_prompt\": \"...\" }}"
        )
        
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config={"response_mime_type": "application/json"}
            )
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"Brain Decision Failed: {e}")
            return {"action": "IGNORE"}

    def generate_reply(self, target_post_text: str) -> str:
        """
        Generates a witty, relevant reply.
        """
        prompt = (
            f"You are Vector (AI Agent). Write a short, witty, 1-sentence reply to this post: "
            f"'{target_post_text}' "
            f"Tone: Intelligent, slightly cyberpunk. No hashtags."
        )
        
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Reply generation failed: {e}")
            return None
