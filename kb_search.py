#!/usr/bin/env python3

import argparse
import os
import sys
from typing import List

from dotenv import load_dotenv
from supabase import create_client, Client

# Try to import OpenAI (prefer official over langchain)
try:
    import openai
    USE_OFFICIAL_OPENAI = True
except ImportError:
    try:
        from langchain_openai import OpenAIEmbeddings
        USE_OFFICIAL_OPENAI = False
    except ImportError:
        print("Error: Neither 'openai' nor 'langchain-openai' package found")
        sys.exit(1)


def load_environment():
    """Load environment variables."""
    load_dotenv()
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    openai_key = os.getenv('OPENAI_API_KEY')
    
    if not all([supabase_url, supabase_key, openai_key]):
        print("Error: SUPABASE_URL, SUPABASE_SERVICE_KEY, and OPENAI_API_KEY must be set in .env file")
        sys.exit(1)
    
    return supabase_url, supabase_key, openai_key


def get_embedding(text: str, openai_key: str) -> List[float]:
    """Get embedding from OpenAI."""
    try:
        if USE_OFFICIAL_OPENAI:
            client = openai.OpenAI(api_key=openai_key)
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            return response.data[0].embedding
        else:
            embeddings = OpenAIEmbeddings(
                model="text-embedding-3-small",
                openai_api_key=openai_key
            )
            return embeddings.embed_query(text)
    except Exception as e:
        print(f"Error getting embedding: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description='Search knowledge base')
    parser.add_argument('query', help='Search query text')
    parser.add_argument('--k', type=int, default=8, help='Number of results to return (default: 8)')
    
    args = parser.parse_args()
    
    # Load environment
    supabase_url, supabase_key, openai_key = load_environment()
    
    # Create Supabase client
    try:
        supabase = create_client(supabase_url, supabase_key)
    except Exception as e:
        print(f"Error connecting to Supabase: {e}")
        sys.exit(1)
    
    # Get embedding for query
    embedding = get_embedding(args.query, openai_key)
    print("Embedding length:", len(embedding))
    
    # Search knowledge base
    try:
        result = supabase.rpc("kb_search_chunks", {
            "query_embedding": embedding,
            "match_count": args.k
        }).execute()
        
        rows = result.data
        print("Matches returned:", len(rows))
        
        # Pretty-print results
        for i, row in enumerate(rows, 1):
            distance = round(row.get('distance', 0), 4)
            doc_id = row.get('doc_id', 'N/A')
            chunk_index = row.get('chunk_index', 'N/A')
            content = row.get('content', '')[:200]
            source_url = row.get('source_url') or '-'
            
            print(f"\n{i}. Distance: {distance} | Doc: {doc_id} | Chunk: {chunk_index}")
            print(f"   Content: {content}")
            print(f"   Source: {source_url}")
            
    except Exception as e:
        print(f"Error searching knowledge base: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()