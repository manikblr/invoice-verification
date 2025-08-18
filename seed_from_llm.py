#!/usr/bin/env python3

import argparse
import hashlib
import logging
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Set, Tuple

import openai
import pandas as pd
import tiktoken
from dotenv import load_dotenv
from supabase import create_client, Client
from tqdm import tqdm


def setup_logging():
    """Setup logging configuration."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )


def load_environment() -> Tuple[str, str, str]:
    """Load environment variables."""
    load_dotenv()
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    openai_key = os.getenv('OPENAI_API_KEY')
    
    if not all([supabase_url, supabase_key, openai_key]):
        logging.error("SUPABASE_URL, SUPABASE_SERVICE_KEY, and OPENAI_API_KEY must be set in .env file")
        sys.exit(1)
    
    return supabase_url, supabase_key, openai_key


def read_csv_data(csv_path: str, limit: Optional[int] = None, filter_line: Optional[str] = None, filter_type: Optional[str] = None) -> pd.DataFrame:
    """Read and validate CSV data with optional filtering."""
    try:
        df = pd.read_csv(csv_path)
        # Normalize column names to lowercase
        df.columns = df.columns.str.lower()
        
        # Drop rows with empty service_line or service_type
        df = df.dropna(subset=['service_line', 'service_type'])
        df = df[df['service_line'].str.strip() != '']
        df = df[df['service_type'].str.strip() != '']
        
        original_count = len(df)
        
        # Apply filters
        if filter_line:
            df = df[df['service_line'].str.contains(filter_line, case=False, regex=True, na=False)]
            print(f"After filtering SERVICE_LINE with '{filter_line}': {len(df)} rows remain")
        
        if filter_type:
            df = df[df['service_type'].str.contains(filter_type, case=False, regex=True, na=False)]
            print(f"After filtering SERVICE_TYPE with '{filter_type}': {len(df)} rows remain")
        
        if filter_line or filter_type:
            print(f"Total rows after filtering: {len(df)} (from {original_count})")
        
        if limit:
            df = df.head(limit)
            
        logging.info(f"Read {len(df)} rows from {csv_path}")
        return df
    except Exception as e:
        logging.error(f"Failed to read CSV file: {e}")
        sys.exit(1)


def get_existing_docs(client: Client) -> Set[str]:
    """Get set of existing knowledge doc titles."""
    try:
        result = client.table('knowledge_docs').select('title').execute()
        return {doc['title'] for doc in result.data}
    except Exception as e:
        logging.error(f"Failed to fetch existing docs: {e}")
        return set()


def get_service_type_ids(client: Client) -> Dict[str, int]:
    """Get mapping of service type names to IDs."""
    try:
        result = client.table('service_types').select('id, name').execute()
        return {doc['name'].lower(): doc['id'] for doc in result.data}
    except Exception as e:
        logging.error(f"Failed to fetch service type IDs: {e}")
        return {}


def get_material_ids(client: Client) -> Dict[str, int]:
    """Get mapping of material names to IDs."""
    try:
        result = client.table('materials').select('id, name').execute()
        return {doc['name'].lower(): doc['id'] for doc in result.data}
    except Exception as e:
        logging.error(f"Failed to fetch material IDs: {e}")
        return {}


def construct_prompt(service_line: str, service_type: str) -> str:
    """Construct the prompt for LLM."""
    return f"""You are a facilities maintenance expert in the United States.
For a property's {service_line} – {service_type} job, list the physical materials and consumable parts typically required (e.g., replacement parts, fittings, gaskets, adhesives, etc.).
Return ONLY physical materials/consumables that would appear as line items on an invoice.
EXCLUDE labour, trip charges, helpers, diagnostics, tools, and equipment rentals.
Provide the list in plain text, one item per line."""


def get_llm_response(prompt: str, client_openai: openai.OpenAI, max_retries: int = 3) -> Optional[str]:
    """Get response from OpenAI with exponential backoff."""
    for attempt in range(max_retries):
        try:
            response = client_openai.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1000,
                temperature=0.7
            )
            return response.choices[0].message.content
        except openai.RateLimitError:
            wait_time = (2 ** attempt) * 60  # 1min, 2min, 4min
            logging.warning(f"Rate limit hit, waiting {wait_time} seconds")
            time.sleep(wait_time)
        except Exception as e:
            logging.error(f"OpenAI API error (attempt {attempt + 1}): {e}")
            if attempt == max_retries - 1:
                return None
            time.sleep(2 ** attempt)
    return None


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 120) -> List[str]:
    """Chunk text into overlapping segments based on token count."""
    encoding = tiktoken.get_encoding("cl100k_base")
    tokens = encoding.encode(text)
    
    chunks = []
    start = 0
    
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)
        chunks.append(chunk_text)
        
        if end == len(tokens):
            break
            
        start = end - overlap
    
    return chunks


def get_embedding(text: str, client_openai: openai.OpenAI) -> Optional[List[float]]:
    """Get embedding from OpenAI."""
    try:
        response = client_openai.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        logging.error(f"Failed to get embedding: {e}")
        return None


def insert_knowledge_doc(client: Client, title: str, content: str, doc_key: str, service_line: str, service_type: str, dry_run: bool) -> Optional[int]:
    """Insert knowledge document and return its ID."""
    if dry_run:
        print(f"[DRY RUN] Would insert doc_key={doc_key} title={title}")
        return 1  # Mock ID for dry run
    
    try:
        doc_payload = {
            "title": title,
            "content": content,
            "source_url": None,
            "doc_key": doc_key,
            "service_line": service_line,
            "service_type": service_type
        }
        
        result = client.table('knowledge_docs').upsert(
            doc_payload, on_conflict='doc_key'
        ).execute()
        
        if result.data:
            return result.data[0]['id']
        return None
    except Exception as e:
        logging.error(f"Failed to insert knowledge doc: {e}")
        logging.error(f"Full DB response: {e}")
        return None


def upsert_knowledge_chunks(client: Client, doc_id: int, chunks: List[Tuple[str, List[float]]], dry_run: bool) -> int:
    """Upsert knowledge chunks and return count inserted."""
    if dry_run:
        logging.info(f"[DRY RUN] Would upsert {len(chunks)} chunks for doc {doc_id}")
        return len(chunks)
    
    inserted_count = 0
    
    try:
        for i, (chunk_text, embedding) in enumerate(chunks):
            if embedding:
                result = client.table('knowledge_chunks').upsert({
                    'doc_id': doc_id,
                    'chunk_index': i,
                    'content': chunk_text,
                    'embedding': embedding
                }, on_conflict='doc_id,chunk_index').execute()
                
                if result.data:
                    inserted_count += 1
        
        return inserted_count
    except Exception as e:
        logging.error(f"Failed to upsert knowledge chunks: {e}")
        return 0


def extract_material_names(content: str) -> List[str]:
    """Extract material names from LLM response."""
    lines = content.split('\n')
    materials = []
    
    for line in lines:
        # Remove bullet points, numbers, and extra whitespace
        cleaned = re.sub(r'^\s*[-•*\d\.]+\s*', '', line.strip())
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        if cleaned and len(cleaned) > 2:
            materials.append(cleaned.lower())
    
    return materials


def insert_service_material_mappings(
    client: Client, 
    service_type_id: int, 
    material_names: List[str], 
    material_ids: Dict[str, int], 
    dry_run: bool
) -> int:
    """Insert service-material mappings and return count inserted."""
    if dry_run:
        matched_count = sum(1 for name in material_names if name in material_ids)
        logging.info(f"[DRY RUN] Would insert {matched_count} service-material mappings")
        return matched_count
    
    inserted_count = 0
    mappings = []
    
    for material_name in material_names:
        if material_name in material_ids:
            mappings.append({
                'service_type_id': service_type_id,
                'material_id': material_ids[material_name]
            })
    
    if mappings:
        try:
            # Use upsert with on_conflict ignore
            result = client.table('service_material_map').upsert(
                mappings,
                on_conflict='service_type_id,material_id'
            ).execute()
            
            if result.data:
                inserted_count = len(result.data)
        except Exception as e:
            logging.error(f"Failed to insert service-material mappings: {e}")
    
    return inserted_count


def process_service_type(
    row: pd.Series,
    client: Client,
    client_openai: openai.OpenAI,
    service_type_ids: Dict[str, int],
    material_ids: Dict[str, int],
    existing_docs: Set[str],
    dry_run: bool
) -> Tuple[bool, bool, int, int]:
    """
    Process a single service type.
    Returns: (doc_created, chunks_created_count, mappings_created_count, error_occurred)
    """
    service_line = str(row['service_line']).strip()
    service_type = str(row['service_type']).strip()
    
    title = f"{service_line} – {service_type} materials"
    
    # Compute deterministic doc_key
    doc_key = hashlib.sha256(f"{service_line}|{service_type}|v1".encode("utf-8")).hexdigest()
    
    print(f"Processing: {service_line}, {service_type}, doc_key={doc_key}")
    
    # Skip if already exists
    if title in existing_docs:
        logging.info(f"Skipping existing doc: {title}")
        return False, 0, 0, False
    
    # Get LLM response
    prompt = construct_prompt(service_line, service_type)
    content = get_llm_response(prompt, client_openai)
    
    if not content:
        logging.error(f"Failed to get LLM response for {title}")
        return False, 0, 0, True
    
    # Insert knowledge doc
    doc_id = insert_knowledge_doc(client, title, content, doc_key, service_line, service_type, dry_run)
    if not doc_id:
        logging.error(f"Failed to insert doc: {title}")
        return False, 0, 0, True
    
    # Chunk and embed content
    chunks = chunk_text(content)
    chunk_embeddings = []
    
    for chunk in chunks:
        embedding = None if dry_run else get_embedding(chunk, client_openai)
        chunk_embeddings.append((chunk, embedding))
    
    # Upsert chunks
    chunks_count = upsert_knowledge_chunks(client, doc_id, chunk_embeddings, dry_run)
    
    # Create service-material mappings
    mappings_count = 0
    service_type_key = service_type.lower()
    
    if service_type_key in service_type_ids:
        material_names = extract_material_names(content)
        mappings_count = insert_service_material_mappings(
            client, 
            service_type_ids[service_type_key],
            material_names,
            material_ids,
            dry_run
        )
    
    return True, chunks_count, mappings_count, False


def main():
    parser = argparse.ArgumentParser(description='Seed knowledge from LLM responses')
    parser.add_argument('--dry-run', action='store_true', help='Print planned changes without writing to DB')
    parser.add_argument('--limit', type=int, help='Process only first N service types')
    parser.add_argument('--csv', default='service_lines_types.csv', help='CSV file path')
    parser.add_argument('--max-workers', type=int, default=3, help='Max concurrent LLM requests')
    parser.add_argument('--filter-line', help='Regex filter for SERVICE_LINE column (case-insensitive)')
    parser.add_argument('--filter-type', help='Regex filter for SERVICE_TYPE column (case-insensitive)')
    
    args = parser.parse_args()
    
    setup_logging()
    
    if args.dry_run:
        logging.info("Running in DRY RUN mode")
    
    # Load environment and create clients
    supabase_url, supabase_key, openai_key = load_environment()
    client = create_client(supabase_url, supabase_key)
    client_openai = openai.OpenAI(api_key=openai_key)
    
    # Read CSV data with filtering
    df = read_csv_data(args.csv, args.limit, args.filter_line, args.filter_type)
    
    if len(df) == 0:
        print("No rows to process after filtering.")
        return
    
    # Get existing data
    logging.info("Loading existing data...")
    existing_docs = get_existing_docs(client)
    service_type_ids = get_service_type_ids(client)
    material_ids = get_material_ids(client)
    
    # Process service types
    docs_created = 0
    chunks_created = 0
    mappings_created = 0
    errors = 0
    skipped = 0
    
    logging.info(f"Processing {len(df)} service types...")
    
    if args.max_workers == 1:
        # Sequential processing
        for _, row in tqdm(df.iterrows(), total=len(df)):
            doc_created, chunks_count, mappings_count, error = process_service_type(
                row, client, client_openai, service_type_ids, material_ids, existing_docs, args.dry_run
            )
            
            if doc_created:
                docs_created += 1
            elif not error:
                skipped += 1
            chunks_created += chunks_count
            mappings_created += mappings_count
            if error:
                errors += 1
    else:
        # Parallel processing
        with ThreadPoolExecutor(max_workers=args.max_workers) as executor:
            future_to_row = {
                executor.submit(
                    process_service_type,
                    row, client, client_openai, service_type_ids, material_ids, existing_docs, args.dry_run
                ): row for _, row in df.iterrows()
            }
            
            for future in tqdm(as_completed(future_to_row), total=len(df)):
                try:
                    doc_created, chunks_count, mappings_count, error = future.result()
                    
                    if doc_created:
                        docs_created += 1
                    elif not error:
                        skipped += 1
                    chunks_created += chunks_count
                    mappings_created += mappings_count
                    if error:
                        errors += 1
                        
                except Exception as e:
                    logging.error(f"Future execution failed: {e}")
                    errors += 1
    
    # Print summary
    print(f"\nSummary:")
    print(f"- Knowledge docs created/updated: {docs_created}")
    print(f"- Knowledge chunks created: {chunks_created}")
    print(f"- Service-material mappings created: {mappings_created}")
    print(f"- Items skipped (already exist): {skipped}")
    print(f"- Items with errors: {errors}")
    
    logging.info("Completed successfully")


if __name__ == '__main__':
    main()