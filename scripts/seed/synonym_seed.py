"""
Synonyms seeder - loads from data/item_synonyms.csv
"""

import csv
import uuid
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime


class SynonymSeeder:
    """Loads synonyms from CSV"""
    
    def __init__(self, supabase_tool):
        self.supabase = supabase_tool
        self.csv_path = Path(__file__).parent.parent.parent / "data" / "item_synonyms.csv"
        
        # Expected CSV headers
        self.required_headers = ['canonical_item_id', 'synonym']
        self.optional_headers = ['confidence', 'id']
    
    def seed_synonyms(self, apply: bool = False, limit: Optional[int] = None) -> Dict[str, Any]:
        """Load synonyms from CSV"""
        
        self.supabase.log_event(None, None, 'seed_synonyms', {
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
                
                for row_num, row in enumerate(reader, start=2):
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
                        action = self._upsert_synonym(row, apply)
                        if action == 'created':
                            results['created'] += 1
                        elif action == 'updated':
                            results['updated'] += 1
                        elif action == 'skipped':
                            results['skipped'] += 1
                        
                        results['processed'] += 1
                        
                    except Exception as e:
                        print(f"Row {row_num}: Error processing synonym '{row.get('synonym', 'unknown')}': {e}")
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
    
    def _upsert_synonym(self, row: Dict[str, str], apply: bool) -> str:
        """Upsert a single synonym"""
        
        canonical_item_id = row['canonical_item_id'].strip()
        synonym = row['synonym'].strip()
        confidence_str = row.get('confidence', '1.0').strip()
        synonym_id = row.get('id', '').strip()
        
        # Parse confidence
        try:
            confidence = float(confidence_str) if confidence_str else 1.0
            confidence = max(0.0, min(1.0, confidence))  # Clamp to [0, 1]
        except ValueError:
            confidence = 1.0
        
        # Validate canonical item exists
        canonical_check = self.supabase.client.table('canonical_items')\
            .select('id')\
            .eq('id', canonical_item_id)\
            .execute()
        
        if not canonical_check.data:
            raise ValueError(f"Canonical item {canonical_item_id} not found")
        
        # Check if synonym exists (by canonical_item_id + synonym)
        existing = self.supabase.client.table('synonyms')\
            .select('id, confidence')\
            .eq('canonical_item_id', canonical_item_id)\
            .eq('synonym', synonym)\
            .execute()
        
        synonym_data = {
            'canonical_item_id': canonical_item_id,
            'synonym': synonym,
            'confidence': confidence,
            'updated_at': datetime.utcnow().isoformat()
        }
        
        if existing.data:
            # Update existing synonym if confidence changed
            existing_synonym = existing.data[0]
            
            if existing_synonym.get('confidence') != confidence and apply:
                self.supabase.client.table('synonyms')\
                    .update({'confidence': confidence, 'updated_at': synonym_data['updated_at']})\
                    .eq('id', existing_synonym['id'])\
                    .execute()
                return 'updated'
            elif existing_synonym.get('confidence') != confidence:
                return 'updated'  # Would update in non-dry-run
            else:
                return 'skipped'
        else:
            # Create new synonym
            if synonym_id:
                synonym_data['id'] = synonym_id
            else:
                synonym_data['id'] = str(uuid.uuid4())
            
            synonym_data['created_at'] = datetime.utcnow().isoformat()
            
            if apply:
                self.supabase.client.table('synonyms')\
                    .insert(synonym_data)\
                    .execute()
            
            return 'created'