
import os
import logging
import sys

# Load env vars safely if not present
KEYS = {
    "GOOGLE_API_KEY": "AIzaSyBeatAgIIvyBky4cCNOzHRAsibMGO9qtCI",
    "NEXT_PUBLIC_SUPABASE_URL": "https://ozevwhiipwbcvyzkbhib.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_kdfY7mniWgURSXS3CNCxjw_nogKhLYk"
}

for k, v in KEYS.items():
    if k not in os.environ:
        os.environ[k] = v

# Setup logging
logging.basicConfig(level=logging.INFO)

try:
    # Directly test Gemini
    import google.generativeai as genai

    genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
    
    print("🔌 Testing Gemini Connection...")
    # client = get_genai_client() # SKIPPED
    model = genai.GenerativeModel("gemini-2.0-flash")
    print("🧠 Sending prompt...")
    response = model.generate_content("Hello, this is a test.")
    print(f"✅ Response received: {response.text}")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
