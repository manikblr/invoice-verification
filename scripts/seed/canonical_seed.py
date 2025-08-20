"""
Canonical items seeder - loads from data/canonical_items.csv
"""

import csv
import uuid
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime


class CanonicalSeeder:
    """Loads canonical items from CSV"""
    
    def __init__(self, supabase_tool):
        self.supabase = supabase_tool
        self.csv_path = Path(__file__).parent.parent.parent / "data" / "canonical_items.csv"
        
        # Expected CSV headers
        self.required_headers = ['name', 'category']
        self.optional_headers = ['description', 'id']
    
    def seed_canonical_items(self, apply: bool = False, limit: Optional[int] = None) -> Dict[str, Any]:
        """Load canonical items from CSV"""
        
        self.supabase.log_event(None, None, 'seed_canonical', {
            'apply': apply,
            'limit': limit,
            'csv_path': str(self.csv_path)
        })
        
        if not self.csv_path.exists():
            return {
                'processed': 0,
                'created': 0,
                'updated': 0,
                'skipped': 0,
                'errors': 1,
                'error_message': f"CSV file not found: {self.csv_path}"
            }
        
        results = {
            'processed': 0,
            'created': 0,
            'updated': 0,
            'skipped': 0,
            'errors': 0
        }
        
        try:
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                # Validate headers
                if not self._validate_headers(reader.fieldnames):
                    return {
                        **results,
                        'errors': 1,
                        'error_message': f"Invalid CSV headers. Required: {self.required_headers}"
                    }
                
                for row_num, row in enumerate(reader, start=2):  # Start at 2 for header
                    if limit and results['processed'] >= limit:
                        break
                    
                    # Skip empty rows
                    if not any(row.values()):
                        results['skipped'] += 1
                        continue
                    
                    # Validate required fields
                    if not all(row.get(field, '').strip() for field in self.required_headers):
                        print(f"Row {row_num}: Missing required fields, skipping")
                        results['skipped'] += 1
                        continue
                    
                    # Process row
                    try:
                        action = self._upsert_canonical_item(row, apply)
                        if action == 'created':
                            results['created'] += 1
                        elif action == 'updated':
                            results['updated'] += 1
                        elif action == 'skipped':
                            results['skipped'] += 1
                        
                        results['processed'] += 1
                        
                    except Exception as e:
                        print(f"Row {row_num}: Error processing {row.get('name', 'unknown')}: {e}")
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
    
    def _upsert_canonical_item(self, row: Dict[str, str], apply: bool) -> str:
        """Upsert a single canonical item"""
        
        name = row['name'].strip()
        category = row['category'].strip()
        description = row.get('description', '').strip()
        item_id = row.get('id', '').strip()
        
        # Check if item exists (by name)
        existing = self.supabase.client.table('canonical_items')\
            .select('id, name, category, description')\
            .eq('name', name)\
            .execute()
        
        item_data = {
            'name': name,
            'category': category,
            'description': description or None,
            'updated_at': datetime.utcnow().isoformat()
        }
        
        if existing.data:
            # Update existing item
            existing_item = existing.data[0]
            
            # Check if update needed
            needs_update = (
                existing_item['category'] != category or
                existing_item.get('description') != (description or None)
            )
            
            if needs_update and apply:
                self.supabase.client.table('canonical_items')\
                    .update(item_data)\
                    .eq('id', existing_item['id'])\
                    .execute()
                return 'updated'
            elif needs_update:
                # In dry-run, still count as would-be updated
                return 'updated'
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
                self.supabase.client.table('canonical_items')\
                    .insert(item_data)\
                    .execute()
            
            return 'created'