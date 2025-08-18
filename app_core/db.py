"""
Database client factory for Supabase connection
"""
import os
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

# Module-level cache
_client: Optional[Client] = None

def get_supabase_client() -> Client:
    """
    Get Supabase client instance. Reads environment variables but does NOT log values.
    Returns cached client instance for efficiency.
    """
    global _client
    
    if _client is None:
        load_dotenv()
        
        supabase_url = os.getenv('SUPABASE_URL')
        supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment")
        
        _client = create_client(supabase_url, supabase_key)
    
    return _client