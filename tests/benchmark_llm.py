import time
import sys
import os
import logging
from dotenv import load_dotenv

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add functions path to sys.path to import modules
sys.path.append(os.path.join(os.path.dirname(__file__), '../functions/vector-agent-python'))

from engagement_brain import EngagementBrain

# Load Key
env_path = os.path.join(os.path.dirname(__file__), '../.env.local')
load_dotenv(env_path)
api_key = os.environ.get("GOOGLE_API_KEY")

if not api_key:
    logger.error("❌ GOOGLE_API_KEY not found. Please set it in .env.local")
    sys.exit(1)

def benchmark_conversation_flow(brain):
    """
    Simulates a direct conversation (Analytical Question)
    """
    logger.info("--- Benchmarking Conversation Flow (Analytical) ---")
    start_time = time.time()
    
    # Simulate a user asking for analysis
    posts = ["AI is changing the world", "Python is great", "Clouds are fluffy"]
    result = brain.analyze_social_economy(posts)
    
    end_time = time.time()
    duration = end_time - start_time
    logger.info(f"✅ Conversation Result: {result.get('angle', 'N/A')}")
    logger.info(f"⏱️ Time Taken: {duration:.4f} seconds")
    return duration

def benchmark_slack_flow(brain):
    """
    Simulates a Slack/Social engagement (Decision & Reply)
    """
    logger.info("--- Benchmarking Slack Response Flow (Decision) ---")
    start_time = time.time()
    
    # Simulate a Slack message/Social Post
    text = "Has anyone tried the new Genie agent? It looks cool."
    author = "jroot_dev"
    context = "Slack #general channel"
    
    result = brain.decide_engagement(text, author, context)
    
    end_time = time.time()
    duration = end_time - start_time
    logger.info(f"✅ Slack Action: {result.get('action', 'N/A')}")
    if result.get('reply_text'):
        logger.info(f"💬 Reply: {result.get('reply_text')}")
    logger.info(f"⏱️ Time Taken: {duration:.4f} seconds")
    return duration

def benchmark_heavy_load(brain):
    """
    Simulates a 'Large File' scenario by generating a massive text payload.
    NOTE: True 10GB support requires GCS + Gemini File API.
    This test simulates ~1.4MB text (approx 300k-500k tokens) to stress latency.
    """
    logger.info("--- Benchmarking Heavy Context Load (Stress Test) ---")
    
    # Generate a massive fake log file
    base_text = "ERROR 2026-01-27: Connection timeout in module X. Retrying... success.\n"
    # Repeat 20,000 times -> ~1.4MB of text
    heavy_text = base_text * 20000 
    
    logger.info(f"📦 Payload Size: {len(heavy_text)/1024/1024:.2f} MB")
    start_time = time.time()
    
    # Analyze the massive block
    result = brain.analyze_social_economy([heavy_text])
    
    end_time = time.time()
    duration = end_time - start_time
    logger.info(f"✅ Heavy Analysis Result: {result.get('angle', 'N/A')}")
    logger.info(f"⏱️ Time Taken: {duration:.4f} seconds")
    return duration

if __name__ == "__main__":
    logger.info("🚀 Starting LLM Latency Benchmark...")
    
    try:
        brain = EngagementBrain(api_key=api_key)
        
        t1 = benchmark_conversation_flow(brain)
        print("-" * 30)
        t2 = benchmark_slack_flow(brain)
        print("-" * 30)
        t3 = benchmark_heavy_load(brain)
        
        print("\n📊 SUMMARY")
        print(f"Conversation Latency: {t1:.4f}s")
        print(f"Slack (Decision) Latency: {t2:.4f}s")
        print(f"Heavy Load Latency:   {t3:.4f}s")
        
        faster = "Conversation" if t1 < t2 else "Slack"
        print(f"🏆 {faster} was faster (Small Payload)")
        
    except Exception as e:
        logger.error(f"Benchmark Failed: {e}")
