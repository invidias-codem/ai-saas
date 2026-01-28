
import os
from supabase import create_client, Client

url = "https://ozevwhiipwbcvyzkbhib.supabase.co"
key = "sb_secret_kdfY7mniWgURSXS3CNCxjw_nogKhLYk"

print(f"🔌 Connecting to Supabase: {url}")
try:
    supabase: Client = create_client(url, key)
    print("✅ Client created")
    # Try a simple select to verify auth
    res = supabase.table("messages").select("count", count="exact").execute()
    print(f"✅ Success! Count: {res.count}")
except Exception as e:
    print(f"❌ Failed: {e}")
