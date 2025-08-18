#!/usr/bin/env python3

import argparse
import logging
import os
import re
import sys
from typing import Dict, List, Optional, Tuple

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client


def normalize_text(text: str) -> str:
    """Normalize text: strip, collapse whitespace, title case."""
    if pd.isna(text) or not text:
        return ""
    # Strip and collapse internal whitespace
    normalized = re.sub(r'\s+', ' ', str(text).strip())
    # Title case
    return normalized.title()


def setup_logging():
    """Setup logging configuration."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )


def load_environment() -> Tuple[str, str]:
    """Load environment variables."""
    load_dotenv()
    
    url = os.getenv('SUPABASE_URL')
    service_key = os.getenv('SUPABASE_SERVICE_KEY')
    
    if not url or not service_key:
        logging.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env file")
        sys.exit(1)
    
    return url, service_key


def read_csv_data(csv_path: str) -> pd.DataFrame:
    """Read and validate CSV data."""
    try:
        df = pd.read_csv(csv_path)
        logging.info(f"Read {len(df)} rows from {csv_path}")
        return df
    except Exception as e:
        logging.error(f"Failed to read CSV file: {e}")
        sys.exit(1)


def validate_and_normalize_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and normalize the CSV data."""
    initial_count = len(df)
    
    # Normalize column names to lowercase
    df.columns = df.columns.str.lower()
    
    # Drop rows with empty service_line or service_type
    df = df.dropna(subset=['service_line', 'service_type'])
    df = df[df['service_line'].str.strip() != '']
    df = df[df['service_type'].str.strip() != '']
    
    dropped_count = initial_count - len(df)
    if dropped_count > 0:
        logging.warning(f"Dropped {dropped_count} rows with empty service_line or service_type")
    
    # Normalize text fields
    df['service_line'] = df['service_line'].apply(normalize_text)
    df['service_type'] = df['service_type'].apply(normalize_text)
    
    if 'service_line_description' in df.columns:
        df['service_line_description'] = df['service_line_description'].apply(
            lambda x: normalize_text(x) if pd.notna(x) and str(x).strip() else None
        )
    else:
        df['service_line_description'] = None
    
    logging.info(f"Validated and normalized {len(df)} rows")
    return df


def chunk_list(lst: List, chunk_size: int):
    """Split list into chunks of specified size."""
    for i in range(0, len(lst), chunk_size):
        yield lst[i:i + chunk_size]


def upsert_service_lines(client: Client, service_lines_data: List[Dict], dry_run: bool) -> Dict[str, int]:
    """Upsert service lines and return name -> id mapping."""
    if dry_run:
        logging.info(f"[DRY RUN] Would upsert {len(service_lines_data)} service lines")
        # Create mock mapping for dry run
        return {item['name']: i + 1 for i, item in enumerate(service_lines_data)}
    
    service_line_map = {}
    
    try:
        for chunk in chunk_list(service_lines_data, 500):
            # Upsert service lines
            result = client.table('service_lines').upsert(
                chunk,
                on_conflict='name'
            ).execute()
            
            if not result.data:
                logging.error("Failed to upsert service lines chunk")
                sys.exit(1)
            
            # Build mapping
            for item in result.data:
                service_line_map[item['name']] = item['id']
        
        logging.info(f"Upserted {len(service_lines_data)} service lines")
        
    except Exception as e:
        logging.error(f"Failed to upsert service lines: {e}")
        sys.exit(1)
    
    return service_line_map


def upsert_service_types(client: Client, service_types_data: List[Dict], dry_run: bool) -> int:
    """Upsert service types and return count inserted."""
    if dry_run:
        logging.info(f"[DRY RUN] Would upsert {len(service_types_data)} service types")
        return len(service_types_data)
    
    inserted_count = 0
    
    try:
        for chunk in chunk_list(service_types_data, 500):
            # Use upsert with on_conflict do nothing
            result = client.table('service_types').upsert(
                chunk,
                on_conflict='service_line_id,name'
            ).execute()
            
            if result.data:
                inserted_count += len(result.data)
        
        logging.info(f"Upserted {inserted_count} service types")
        
    except Exception as e:
        logging.error(f"Failed to upsert service types: {e}")
        sys.exit(1)
    
    return inserted_count


def print_summary(df: pd.DataFrame, service_lines_count: int, service_types_count: int):
    """Print summary statistics."""
    print(f"\nSummary:")
    print(f"- Service lines inserted/updated: {service_lines_count}")
    print(f"- Service types inserted: {service_types_count}")
    
    print(f"\nTop 10 service types per line (by count in CSV):")
    type_counts = df.groupby(['service_line', 'service_type']).size().reset_index(name='count')
    
    for service_line in df['service_line'].unique()[:10]:
        line_types = type_counts[type_counts['service_line'] == service_line]
        line_types = line_types.nlargest(10, 'count')
        print(f"\n{service_line}:")
        for _, row in line_types.iterrows():
            print(f"  - {row['service_type']}: {row['count']}")


def run_sanity_check(client: Client, dry_run: bool):
    """Run and print sanity check queries."""
    if dry_run:
        print(f"\n[DRY RUN] Would run sanity check queries")
        return
    
    try:
        # Total service lines
        lines_result = client.table('service_lines').select('id', count='exact').execute()
        total_lines = lines_result.count
        
        # Total service types
        types_result = client.table('service_types').select('id', count='exact').execute()
        total_types = types_result.count
        
        # Service types with null service_line_id
        null_types = client.table('service_types').select('id', count='exact').is_('service_line_id', 'null').execute()
        null_count = null_types.count
        
        print(f"\nSanity Check:")
        print(f"- Total service lines: {total_lines}")
        print(f"- Total service types: {total_types}")
        print(f"- Service types with null service_line_id: {null_count}")
        
        if null_count > 0:
            logging.warning(f"Found {null_count} service types with null service_line_id!")
        
    except Exception as e:
        logging.error(f"Failed to run sanity check: {e}")


def main():
    parser = argparse.ArgumentParser(description='Seed service lines and types from CSV')
    parser.add_argument('--dry-run', action='store_true', help='Print planned changes without writing to DB')
    parser.add_argument('--csv', default='service_lines_types.csv', help='CSV file path (default: service_lines_types.csv)')
    
    args = parser.parse_args()
    
    setup_logging()
    
    if args.dry_run:
        logging.info("Running in DRY RUN mode")
    
    # Load environment and create client
    url, service_key = load_environment()
    client = create_client(url, service_key)
    
    # Read and validate data
    df = read_csv_data(args.csv)
    df = validate_and_normalize_data(df)
    
    # Prepare service lines data
    service_lines_df = df[['service_line', 'service_line_description']].drop_duplicates(subset=['service_line'])
    service_lines_data = []
    
    for _, row in service_lines_df.iterrows():
        item = {'name': row['service_line']}
        if pd.notna(row['service_line_description']) and row['service_line_description']:
            item['description'] = row['service_line_description']
        service_lines_data.append(item)
    
    # Upsert service lines and get mapping
    service_line_map = upsert_service_lines(client, service_lines_data, args.dry_run)
    
    # Prepare service types data
    service_types_data = []
    for _, row in df.iterrows():
        service_line_id = service_line_map.get(row['service_line'])
        if service_line_id:
            service_types_data.append({
                'name': row['service_type'],
                'service_line_id': service_line_id
            })
    
    # Remove duplicates
    seen = set()
    unique_service_types = []
    for item in service_types_data:
        key = (item['service_line_id'], item['name'])
        if key not in seen:
            seen.add(key)
            unique_service_types.append(item)
    
    # Upsert service types
    service_types_count = upsert_service_types(client, unique_service_types, args.dry_run)
    
    # Print summary
    print_summary(df, len(service_lines_data), service_types_count)
    
    # Run sanity check
    run_sanity_check(client, args.dry_run)
    
    logging.info("Completed successfully")


if __name__ == '__main__':
    main()