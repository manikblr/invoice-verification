#!/usr/bin/env python3

import argparse
import csv
import logging
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

def setup_logging():
    """Setup logging configuration."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )

def load_environment():
    """Load environment variables."""
    load_dotenv()
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    
    if not all([supabase_url, supabase_key]):
        logging.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env file")
        sys.exit(1)
    
    return supabase_url, supabase_key

def get_materials_lookup(client: Client) -> Dict[str, int]:
    """Get materials lookup table (name -> id)."""
    try:
        result = client.table('materials').select('id, name').execute()
        return {row['name'].lower(): row['id'] for row in result.data}
    except Exception as e:
        logging.error(f"Failed to load materials: {e}")
        sys.exit(1)

def resolve_material_id(material_name: str, materials_lookup: Dict[str, int]) -> Optional[int]:
    """Resolve material name to material_id."""
    if not material_name:
        return None
    
    normalized = material_name.lower().strip()
    return materials_lookup.get(normalized)

def parse_price(price_str: str) -> Optional[float]:
    """Parse price string to float."""
    if not price_str:
        return None
    
    try:
        return float(str(price_str).strip())
    except (ValueError, TypeError):
        return None

def parse_datetime(dt_str: str) -> Optional[str]:
    """Parse datetime string and validate format."""
    if not dt_str:
        return None
    
    try:
        # Validate it's a proper datetime
        datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        return dt_str
    except (ValueError, TypeError):
        return None

def process_csv_row(row: Dict, materials_lookup: Dict[str, int]) -> Optional[Dict]:
    """Process a single CSV row and return validated data."""
    try:
        material_name = row.get('material', '').strip()
        source = row.get('source', '').strip()
        min_price_str = row.get('min_price', '')
        max_price_str = row.get('max_price', '')
        currency = row.get('currency', '').strip()
        region = row.get('region', '').strip()
        fetched_at_str = row.get('fetched_at', '').strip()
        
        # Resolve material_id
        material_id = resolve_material_id(material_name, materials_lookup)
        if not material_id:
            logging.warning(f"Material not found: {material_name}")
            return None
        
        # Parse prices
        min_price = parse_price(min_price_str)
        max_price = parse_price(max_price_str)
        
        if min_price is None or max_price is None:
            logging.warning(f"Invalid prices for {material_name}: min={min_price_str}, max={max_price_str}")
            return None
        
        # Parse datetime
        fetched_at = parse_datetime(fetched_at_str)
        if not fetched_at:
            logging.warning(f"Invalid datetime for {material_name}: {fetched_at_str}")
            return None
        
        # Validate required fields
        if not source or not currency or not region:
            logging.warning(f"Missing required fields for {material_name}")
            return None
        
        return {
            'material_id': material_id,
            'source': source,
            'min_price': min_price,
            'max_price': max_price,
            'fetched_at': fetched_at,
            'currency': currency,
            'region': region
        }
        
    except Exception as e:
        logging.error(f"Error processing row {row}: {e}")
        return None

def insert_price_cache_batch(client: Client, batch: List[Dict], dry_run: bool) -> int:
    """Insert a batch of price cache records."""
    if not batch:
        return 0
    
    if dry_run:
        logging.info(f"[DRY RUN] Would insert {len(batch)} price cache records")
        return len(batch)
    
    try:
        result = client.table('price_cache').insert(batch).execute()
        return len(result.data) if result.data else 0
    except Exception as e:
        logging.error(f"Failed to insert price cache batch: {e}")
        return 0

def main():
    parser = argparse.ArgumentParser(description='Import price cache data from CSV')
    parser.add_argument('--file', default='price_seed.csv', help='CSV file path')
    parser.add_argument('--dry-run', action='store_true', help='Print planned changes without writing to DB')
    
    args = parser.parse_args()
    
    setup_logging()
    
    if args.dry_run:
        logging.info("Running in DRY RUN mode")
    
    try:
        # Load environment and create client
        supabase_url, supabase_key = load_environment()
        client = create_client(supabase_url, supabase_key)
        
        # Load materials lookup
        logging.info("Loading materials lookup...")
        materials_lookup = get_materials_lookup(client)
        logging.info(f"Loaded {len(materials_lookup)} materials")
        
        # Process CSV file
        logging.info(f"Reading CSV file: {args.file}")
        
        valid_records = []
        total_rows = 0
        skipped_rows = 0
        
        with open(args.file, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            
            for row in reader:
                total_rows += 1
                processed_row = process_csv_row(row, materials_lookup)
                
                if processed_row:
                    valid_records.append(processed_row)
                else:
                    skipped_rows += 1
        
        logging.info(f"Processed {total_rows} rows, {len(valid_records)} valid, {skipped_rows} skipped")
        
        # Insert in batches
        batch_size = 200
        total_inserted = 0
        
        for i in range(0, len(valid_records), batch_size):
            batch = valid_records[i:i + batch_size]
            inserted = insert_price_cache_batch(client, batch, args.dry_run)
            total_inserted += inserted
        
        # Print summary
        print(f"\nSummary:")
        print(f"- Total rows processed: {total_rows}")
        print(f"- Records inserted: {total_inserted}")
        print(f"- Records skipped: {skipped_rows}")
        
        logging.info("Completed successfully")
        
    except FileNotFoundError:
        logging.error(f"CSV file not found: {args.file}")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Script failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()