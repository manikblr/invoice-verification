import os
from supabase import create_client, Client

def get_supabase():
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError("Supabase env not set")
    return create_client(url, key)