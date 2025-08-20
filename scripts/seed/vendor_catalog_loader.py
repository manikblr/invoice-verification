"""
Vendor catalog loader - loads from data/vendor_catalogs/*.csv
"""

import csv
import re
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime


class VendorCatalogLoader:
    """Loads vendor catalogs from CSV files"""
    
    def __init__(self, supabase_tool):
        self.supabase = supabase_tool
        self.catalogs_dir = Path(__file__).parent.parent.parent / "data" / "vendor_catalogs"
        
        # Expected CSV headers
        self.required_headers = ['vendor_id', 'vendor_sku', 'name']
        self.optional_headers = ['canonical_item_id', 'id']
    
    def load_all_catalogs(self, apply: bool = False, limit: Optional[int] = None, 
                         vendor_filter: Optional[str] = None) -> Dict[str, Any]:
        """Load all vendor catalog CSV files"""
        
        self.supabase.log_event(None, None, 'seed_vendor_catalog', {
            'apply': apply,
            'limit': limit,
            'vendor_filter': vendor_filter,
            'catalogs_dir': str(self.catalogs_dir)
        })
        
        if not self.catalogs_dir.exists():
            return {
                'processed': 0,
                'created': 0,
                'updated': 0,
                'skipped': 0,
                'errors': 1,
                'files_processed': 0,
                'error_message': f"Vendor catalogs directory not found: {self.catalogs_dir}"
            }
        
        # Find all CSV files
        csv_files = list(self.catalogs_dir.glob("*.csv"))
        if not csv_files:
            return {
                'processed': 0,
                'created': 0,
                'updated': 0,
                'skipped': 0,
                'errors': 0,
                'files_processed': 0,
                'error_message': f"No CSV files found in {self.catalogs_dir}"
            }
        
        total_results = {
            'processed': 0,
            'created': 0,
            'updated': 0,
            'skipped': 0,
            'errors': 0,
            'files_processed': 0
        }
        
        for csv_file in csv_files:
            print(f"  Processing {csv_file.name}...")
            
            file_results = self._load_single_catalog(
                csv_file, apply, limit, vendor_filter
            )
            
            # Aggregate results
            for key in ['processed', 'created', 'updated', 'skipped', 'errors']:
                total_results[key] += file_results.get(key, 0)
            
            total_results['files_processed'] += 1
            
            # Apply limit across all files
            if limit and total_results['processed'] >= limit:
                break
        
        return total_results
    
    def _load_single_catalog(self, csv_file: Path, apply: bool, 
                           limit: Optional[int], vendor_filter: Optional[str]) -> Dict[str, Any]:
        """Load a single vendor catalog CSV file"""
        
        results = {
            'processed': 0,
            'created': 0,
            'updated': 0,
            'skipped': 0,
            'errors': 0
        }
        
        try:
            with open(csv_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                # Validate headers
                if not self._validate_headers(reader.fieldnames):
                    return {
                        **results,
                        'errors': 1,
                        'error_message': f"Invalid CSV headers in {csv_file.name}. Required: {self.required_headers}"
                    }
                
                for row_num, row in enumerate(reader, start=2):
                    if limit and results['processed'] >= limit:
                        break
                    
                    # Skip empty rows
                    if not any(row.values()):
                        results['skipped'] += 1
                        continue
                    
                    # Validate required fields
                    if not all(row.get(field, '').strip() for field in self.required_headers):
                        results['skipped'] += 1
                        continue
                    
                    # Apply vendor filter
                    if vendor_filter and row.get('vendor_id', '').strip() != vendor_filter:
                        results['skipped'] += 1
                        continue
                    
                    # Process row
                    try:
                        action = self._upsert_catalog_item(row, apply)
                        if action == 'created':
                            results['created'] += 1
                        elif action == 'updated':
                            results['updated'] += 1
                        elif action == 'skipped':
                            results['skipped'] += 1
                        
                        results['processed'] += 1
                        
                    except Exception as e:
                        vendor_sku = row.get('vendor_sku', 'unknown')
                        print(f"    Row {row_num}: Error processing SKU {vendor_sku}: {e}")
                        results['errors'] += 1
        
        except Exception as e:
            results['errors'] += 1
            results['error_message'] = str(e)
        
        return results
    
    def _validate_headers(self, headers) -> bool:
        """Validate CSV has required headers"""
        if not headers:
            return False
        return all(header in headers for header in self.required_headers)
    
    def _normalize_name(self, name: str) -> str:
        """Normalize item name for searching"""
        # Lowercase and collapse whitespace
        return re.sub(r'\s+', ' ', name.lower().strip())
    
    def _upsert_catalog_item(self, row: Dict[str, str], apply: bool) -> str:
        """Upsert a single vendor catalog item"""
        
        vendor_id = row['vendor_id'].strip()
        vendor_sku = row['vendor_sku'].strip()
        name = row['name'].strip()
        canonical_item_id = row.get('canonical_item_id', '').strip() or None
        item_id = row.get('id', '').strip()
        
        # Generate normalized name
        normalized_name = self._normalize_name(name)
        
        # Check if item exists (by vendor_id + vendor_sku)
        existing = self.supabase.client.table('vendor_catalog_items')\
            .select('id, name, normalized_name, canonical_item_id')\
            .eq('vendor_id', vendor_id)\
            .eq('vendor_sku', vendor_sku)\
            .execute()
        
        item_data = {
            'vendor_id': vendor_id,
            'vendor_sku': vendor_sku,
            'name': name,
            'normalized_name': normalized_name,
            'canonical_item_id': canonical_item_id,
            'updated_at': datetime.utcnow().isoformat()
        }
        
        if existing.data:
            # Update existing item if changed
            existing_item = existing.data[0]
            
            needs_update = (
                existing_item['name'] != name or
                existing_item.get('normalized_name') != normalized_name or
                existing_item.get('canonical_item_id') != canonical_item_id
            )
            
            if needs_update and apply:
                self.supabase.client.table('vendor_catalog_items')\
                    .update(item_data)\
                    .eq('id', existing_item['id'])\
                    .execute()
                return 'updated'
            elif needs_update:
                return 'updated'  # Would update in non-dry-run
            else:
                return 'skipped'
        else:
            # Create new item
            if item_id:
                item_data['id'] = item_id
            else:
                item_data['id'] = str(uuid.uuid4())
            
            item_data['created_at'] = datetime.utcnow().isoformat()
            
            if apply:
                self.supabase.client.table('vendor_catalog_items')\
                    .insert(item_data)\
                    .execute()
            
            return 'created'