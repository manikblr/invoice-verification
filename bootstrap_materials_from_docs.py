#!/usr/bin/env python3

import argparse
import logging
import os
import re
import sys
from typing import Dict, List, Optional, Set, Tuple

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client
from tqdm import tqdm


def setup_logging():
    """Setup logging configuration."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )


def load_environment() -> Tuple[str, str]:
    """Load environment variables."""
    load_dotenv()
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    
    if not all([supabase_url, supabase_key]):
        logging.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env file")
        sys.exit(1)
    
    return supabase_url, supabase_key


def fetch_knowledge_docs(client: Client, filter_line: str, filter_type: str, limit: Optional[int] = None) -> List[Dict]:
    """Fetch knowledge docs matching filters."""
    try:
        query = client.table('knowledge_docs').select('id, title, content, service_line, service_type')
        
        # Build WHERE conditions
        line_condition = f"service_line.ilike.%{filter_line}%,title.ilike.%{filter_line}%"
        type_condition = f"service_type.ilike.%{filter_type}%,title.ilike.%{filter_type}%"
        
        # Apply filters using or conditions
        query = query.or_(line_condition).or_(type_condition)
        query = query.order('id', desc=True)
        
        if limit:
            query = query.limit(limit)
        
        result = query.execute()
        return result.data
    except Exception as e:
        logging.error(f"Failed to fetch knowledge docs: {e}")
        sys.exit(1)


def parse_service_line_type(doc: Dict) -> Tuple[Optional[str], Optional[str]]:
    """Parse service_line and service_type from doc."""
    service_line = doc.get('service_line')
    service_type = doc.get('service_type')
    
    # If both columns are populated, use them
    if service_line and service_type:
        return service_line.strip(), service_type.strip()
    
    # Try to parse from title
    title = doc.get('title', '')
    if title:
        # Try different separators
        for sep in [' – ', ' - ', ' — ']:
            if sep in title:
                parts = title.split(sep, 1)
                if len(parts) == 2:
                    # Remove " materials" suffix if present
                    st_part = parts[1].replace(' materials', '').strip()
                    return parts[0].strip(), st_part
    
    return service_line, service_type


def extract_material_names(content: str) -> List[str]:
    """Extract and clean material names from content."""
    if not content:
        return []
    
    lines = content.split('\n')
    materials = []
    
    # Words to exclude (case-insensitive)
    exclude_words = [
        "labour", "labor", "helper", "trip", "diagnostic", "inspection", 
        "dispatch", "overtime", "service charge", "callout", "fee", "tool", "rental"
    ]
    
    for line in lines:
        # Strip whitespace
        line = line.strip()
        if not line:
            continue
        
        # Remove bullets/numbering
        cleaned = re.sub(r'^[\s•\-\–\—\*\d\)\(\.]+\s*', '', line)
        cleaned = cleaned.strip()
        
        if not cleaned or len(cleaned) < 2:
            continue
        
        # Check for excluded words (case-insensitive)
        if any(word.lower() in cleaned.lower() for word in exclude_words):
            continue
        
        # Canonicalize: collapse spaces and title-case
        canonical = re.sub(r'\s+', ' ', cleaned).title()
        materials.append(canonical)
    
    # Return unique materials preserving order
    seen = set()
    unique_materials = []
    for material in materials:
        if material not in seen:
            seen.add(material)
            unique_materials.append(material)
    
    return unique_materials


def upsert_materials(client: Client, materials: List[str], dry_run: bool) -> int:
    """Upsert materials into database."""
    if not materials:
        return 0
    
    if dry_run:
        print(f"[DRY RUN] Would upsert {len(materials)} materials: {materials[:5]}{'...' if len(materials) > 5 else ''}")
        return len(materials)
    
    # Prepare batch payloads
    payloads = []
    for material in materials:
        payloads.append({
            "name": material,
            "description": None,
            "base_unit": "unknown", 
            "status": "unknown"
        })
    
    # Process in batches of 200
    batch_size = 200
    total_upserted = 0
    
    for i in range(0, len(payloads), batch_size):
        batch = payloads[i:i + batch_size]
        try:
            result = client.table('materials').upsert(batch, on_conflict='name').execute()
            if result.data:
                total_upserted += len(result.data)
        except Exception as e:
            logging.error(f"Failed to upsert materials batch: {e}")
    
    return total_upserted


def resolve_service_type_id(client: Client, service_line: str, service_type: str) -> Optional[int]:
    """Resolve service_type_id from service_line and service_type names."""
    if not service_line or not service_type:
        return None
    
    try:
        # resolve service_type_id via RPC
        res = client.rpc(
            "get_service_type_id",
            {"p_line": service_line, "p_type": service_type}
        ).execute()

        service_type_id = None
        if hasattr(res, "data") and res.data:
            # res.data is either an int (preferred) or a list with a single int depending on client version
            service_type_id = res.data if isinstance(res.data, int) else res.data[0]

        return service_type_id
    except Exception as e:
        logging.warning(f"Failed to resolve service_type_id for {service_line} - {service_type}: {e}")
        return None


def resolve_material_ids(client: Client, material_names: List[str]) -> Dict[str, int]:
    """Resolve material IDs for given names."""
    if not material_names:
        return {}
    
    try:
        result = client.table('materials').select('id, name').in_('name', material_names).execute()
        return {row['name']: row['id'] for row in result.data}
    except Exception as e:
        logging.error(f"Failed to resolve material IDs: {e}")
        return {}


def insert_service_material_mappings(client: Client, service_type_id: int, material_ids: List[int], dry_run: bool) -> int:
    """Insert service-material mappings."""
    if not material_ids:
        return 0
    
    if dry_run:
        print(f"[DRY RUN] Would insert {len(material_ids)} mappings for service_type_id {service_type_id}")
        return len(material_ids)
    
    # Prepare batch payloads
    payloads = []
    for material_id in material_ids:
        payloads.append({
            "service_type_id": service_type_id,
            "material_id": material_id
        })
    
    # Process in batches of 200
    batch_size = 200
    total_inserted = 0
    
    for i in range(0, len(payloads), batch_size):
        batch = payloads[i:i + batch_size]
        try:
            result = client.table('service_material_map').upsert(
                batch, 
                on_conflict='service_type_id,material_id',
                count='exact'
            ).execute()
            if hasattr(result, 'count') and result.count is not None:
                total_inserted += result.count
            elif result.data:
                total_inserted += len(result.data)
        except Exception as e:
            logging.error(f"Failed to insert service-material mappings batch: {e}")
    
    return total_inserted


def process_doc(client: Client, doc: Dict, dry_run: bool) -> Tuple[int, int]:
    """Process a single knowledge doc."""
    doc_id = doc['id']
    content = doc.get('content', '')
    
    # Parse service line and type
    service_line, service_type = parse_service_line_type(doc)
    
    # Extract material names
    material_names = extract_material_names(content)
    candidates_count = len(material_names)
    
    # Upsert materials
    upserted_count = upsert_materials(client, material_names, dry_run)
    
    # Create service-material mappings
    mapped_count = 0
    if service_line and service_type and material_names:
        service_type_id = resolve_service_type_id(client, service_line, service_type)
        if not service_type_id:
            print(f"[WARN] No service_type_id for ({service_line}, {service_type}); skipping mappings for this doc.")
            return upserted_count, 0
        
        material_id_map = resolve_material_ids(client, material_names)
        material_ids = list(material_id_map.values())
        mapped_count = insert_service_material_mappings(client, service_type_id, material_ids, dry_run)
    
    print(f"Doc {doc_id}: {service_line} - {service_type}, candidates={candidates_count}, upserted={upserted_count}, mapped={mapped_count}")
    
    return upserted_count, mapped_count


def main():
    parser = argparse.ArgumentParser(description='Bootstrap materials from knowledge docs')
    parser.add_argument('--filter-line', required=True, help='Regex filter for service_line (required)')
    parser.add_argument('--filter-type', required=True, help='Regex filter for service_type (required)')
    parser.add_argument('--limit', type=int, help='Limit number of docs to process')
    parser.add_argument('--dry-run', action='store_true', help='Print planned changes without writing to DB')
    
    args = parser.parse_args()
    
    setup_logging()
    
    if args.dry_run:
        logging.info("Running in DRY RUN mode")
    
    try:
        # Load environment and create client
        supabase_url, supabase_key = load_environment()
        client = create_client(supabase_url, supabase_key)
        
        # Fetch knowledge docs
        print(f"Fetching docs with filters: line='{args.filter_line}', type='{args.filter_type}'")
        docs = fetch_knowledge_docs(client, args.filter_line, args.filter_type, args.limit)
        
        if not docs:
            print("No docs found matching filters.")
            sys.exit(0)
        
        print(f"Found {len(docs)} docs to process")
        
        # Process docs
        total_upserted = 0
        total_mapped = 0
        
        for doc in tqdm(docs, desc="Processing docs"):
            upserted, mapped = process_doc(client, doc, args.dry_run)
            total_upserted += upserted
            total_mapped += mapped
        
        # Print summary
        print(f"\nSummary:")
        print(f"- Total materials upserted: {total_upserted}")
        print(f"- Total mappings created: {total_mapped}")
        print(f"- Docs processed: {len(docs)}")
        
        logging.info("Completed successfully")
        sys.exit(0)
        
    except Exception as e:
        logging.error(f"Script failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()