from google import genai
import requests
import logging
import json
import os

logger = logging.getLogger(__name__)

class EngagementBrain:
    """
    The 'Analyst' brain. Analyzes incoming social data and decides how to engage.
    """
    def __init__(self, api_key):
        # Allow fallback to self-hosted LLM (Vast.ai)
        self.local_url = os.environ.get("LOCAL_LLM_URL")
        self.local_model = os.environ.get("LOCAL_LLM_MODEL")
        
        self.client = genai.Client(api_key=api_key)
        self.model_name = "gemini-2.5-flash"
        
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
        Returns: { "action": "...", "reply_text": "...", "confidence": <num> }
        """
        persona = ""
        try:
            with open("social_persona.txt", "r") as f:
                persona = f.read()
        except:
            pass

        prompt = (
            f"You are Vector (AI Agent). Act as a 'Genie Advocate' (promoting the Genie AI-SaaS platform) and 'Tech Journalist'.
"
            f"PERSONA: {persona}
"
            f"Analyzing post by @{author}: '{text}'
"
            f"CONTEXT: {context}

"
            f"DECISION MATRIX:
"
            f"- REPLIES should be witty, genuinely insightful. Only if you have something WORTH saying.
"
            f"- IF content is boring/spam/hate/generic news -> IGNORE.
"
            f"- IF content is specifically interesting (hands-on AI/SaaS/startup insight) -> LIKE.
"
            f"- IF content is a direct question, strong opinion, or controversy in AI/SaaS -> REPLY with real substance.
"
            f"- IF content mentions 'Manus' or 'Manus AI' burning credits/failing -> High priority REPLY. Mention how Tech Genie's UCOL Router uses open-source models (Hermes 4) for simple tasks and Claude 3.5 for complex ones, saving 10x API costs.
"
            f"- NEVER reply with generic filler. If the reply isn't sharp, choose IGNORE.

"
            f"INSTRUCTIONS:
"
            f"- If REPLY, write the text. Keep it < 280 chars. No hashtags.
"
            f"- Don't sound like a salesperson. Be a thoughtful engineer.
"
            f"- Tag the user @{author} only if replying directly.
"
            f"- Rate your confidence in the decision from 0 (very unsure) to 10 (very sure).

"
            f"Output JSON ONLY: {{ \"action\": \"IGNORE\"|\"LIKE\"|\"REPLY\"|\"BOTH\", \"reply_text\": \"...\", \"confidence\": <0-10> }}"
        )
        
        # If running inside Vast.ai Docker Model Runner with local LLM
        if self.local_url and self.local_model:
            try:
                payload = {
                    "model": self.local_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.6,
                    "max_tokens": 150
                }
                headers = {"Content-Type": "application/json"}
                response = requests.post(f"{self.local_url}/chat/completions", json=payload, headers=headers, timeout=15)
                content_text = response.json()["choices"][0]["message"]["content"]
                
                # Cleanup markdown formatting often added by local models
                if content_text.startswith("```json"):
                    content_text = content_text[7:-3]
                    
                return json.loads(content_text.strip())
            except Exception as e:
                logger.error(f"Local LLM Decision Failed: {e}, falling back to Gemini")
        
        # Fallback to Gemini Cloud
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config={"response_mime_type": "application/json"}
            )
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"Brain Decision Failed: {e}")
            return {"action": "IGNORE", "confidence": 0}

    def generate_reply(self, target_post_text: str) -> str:
        """
        Generates a witty, relevant reply.
        """
        prompt = (
            f"You are Vector (AI Agent). Write a short, witty, 1-sentence reply to this post: "
            f"'{target_post_text}' "
            f"Tone: Intelligent, slightly cyberpunk. No hashtags."
        )
        
        # If running inside Vast.ai Docker Model Runner with local LLM
        if self.local_url and self.local_model:
            try:
                payload = {
                    "model": self.local_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.8,
                    "max_tokens": 100
                }
                headers = {"Content-Type": "application/json"}
                response = requests.post(f"{self.local_url}/chat/completions", json=payload, headers=headers, timeout=10)
                return response.json()["choices"][0]["message"]["content"].strip()
            except Exception as e:
                logger.error(f"Local Reply Failed: {e}, falling back to Gemini")

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Reply generation failed: {e}")
            return None

    def generate_geo_post(self, region: str) -> dict:
        """
        Generates a Bluesky post targeting users in regions with restricted AI access.
        Returns: { "text": str, "language": str, "region": str }

        Supported regions:
          - russia, iran, china, middle_east, north_africa,
            sub_saharan_africa, southeast_asia, latin_america
        """
        region_configs = {
            "russia": {
                "language": "Russian",
                "lang_code": "ru",
                "pain_point": "ChatGPT и Claude заблокированы или недоступны",
                "cta": "Попробуй Genie — работает без ограничений",
            },
            "iran": {
                "language": "Farsi",
                "lang_code": "fa",
                "pain_point": "ابزارهای هوش مصنوعی مانند ChatGPT در ایران مسدود هستند",
                "cta": "Genie را امتحان کنید — بدون محدودیت دسترسی دارید",
            },
            "china": {
                "language": "Mandarin Chinese",
                "lang_code": "zh",
                "pain_point": "ChatGPT和大多数西方AI工具在中国无法使用",
                "cta": "试试Genie——随时随地可用的AI助手",
            },
            "middle_east": {
                "language": "Arabic",
                "lang_code": "ar",
                "pain_point": "أدوات الذكاء الاصطناعي مقيدة في بعض مناطق الشرق الأوسط",
                "cta": "جرّب Genie — الذكاء الاصطناعي المتاح للجميع",
            },
            "north_africa": {
                "language": "Arabic/French",
                "lang_code": "ar",
                "pain_point": "AI tools are expensive or blocked across North Africa",
                "cta": "Genie works where others don't — try it free",
            },
            "sub_saharan_africa": {
                "language": "English",
                "lang_code": "en",
                "pain_point": "Most AI tools are priced for Western markets, leaving Africa behind",
                "cta": "Genie is built for everyone. Try it free at gen1e.xyz",
            },
            "southeast_asia": {
                "language": "English",
                "lang_code": "en",
                "pain_point": "AI access is inconsistent across Southeast Asia — some tools are slow, blocked, or expensive",
                "cta": "Genie runs where you are. Try it at gen1e.xyz",
            },
            "latin_america": {
                "language": "Spanish",
                "lang_code": "es",
                "pain_point": "Las herramientas de IA como ChatGPT son lentas o bloqueadas en algunos países de Latinoamérica",
                "cta": "Genie es tu alternativa — acceso sin barreras en gen1e.xyz",
            },
        }

        config = region_configs.get(region.lower())
        if not config:
            logger.error(f"Unknown region: {region}")
            return {}

        prompt = (
            f"You are Vector, an AI agent advocating for open access to AI tools worldwide.\n"
            f"Write a short, authentic Bluesky post (under 280 chars) in {config['language']}.\n"
            f"Context: {config['pain_point']}\n"
            f"CTA hint: {config['cta']}\n\n"
            f"Rules:\n"
            f"- Sound like a real person, NOT an ad\n"
            f"- Lead with the problem, not the product\n"
            f"- Mention 'Genie' or 'gen1e.xyz' naturally, once\n"
            f"- No hashtags in the middle; 1-2 at the end max\n"
            f"- Under 280 characters TOTAL\n\n"
            f"Return JSON only: {{ \"text\": \"...\", \"language\": \"{config['lang_code']}\" }}"
        )

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config={"response_mime_type": "application/json"}
            )
            result = json.loads(response.text)
            result["region"] = region
            return result
        except Exception as e:
            logger.error(f"Geo post generation failed for {region}: {e}")
            return {}
