import os
import uuid
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from supabase import create_client, Client
import json


@dataclass
class CanonicalItem:
    id: str
    name: str
    category: str
    description: Optional[str] = None


@dataclass
class Synonym:
    id: str
    canonical_item_id: str
    synonym: str
    confidence: float


@dataclass
class PriceRange:
    canonical_item_id: str
    min_price: float
    max_price: float


class SupabaseTool:
    def __init__(self):
        self.url = os.getenv('SUPABASE_URL')
        self.key = os.getenv('SUPABASE_ANON_KEY')
        self.client: Client = create_client(self.url, self.key)
        self.dry_run = os.getenv('AGENT_DRY_RUN', 'true').lower() == 'true'
        
    def get_canonical_items(self) -> List[CanonicalItem]:
        """Get all canonical items for matching"""
        try:
            response = self.client.table('canonical_items').select('*').execute()
            return [
                CanonicalItem(
                    id=row['id'],
                    name=row['name'],
                    category=row.get('category', ''),
                    description=row.get('description')
                )
                for row in response.data
            ]
        except Exception as e:
            self.log_event(None, None, 'ERROR', {'error': str(e), 'operation': 'get_canonical_items'})
            return []
    
    def get_synonyms(self) -> List[Synonym]:
        """Get all synonyms for fuzzy matching"""
        try:
            response = self.client.table('synonyms').select('*').execute()
            return [
                Synonym(
                    id=row['id'],
                    canonical_item_id=row['canonical_item_id'],
                    synonym=row['synonym'],
                    confidence=row.get('confidence', 1.0)
                )
                for row in response.data
            ]
        except Exception as e:
            self.log_event(None, None, 'ERROR', {'error': str(e), 'operation': 'get_synonyms'})
            return []
    
    def get_price_ranges(self) -> List[PriceRange]:
        """Get price ranges for validation"""
        try:
            response = self.client.table('item_price_ranges').select('*').execute()
            return [
                PriceRange(
                    canonical_item_id=row['canonical_item_id'],
                    min_price=float(row['min_price']),
                    max_price=float(row['max_price'])
                )
                for row in response.data
            ]
        except Exception as e:
            self.log_event(None, None, 'ERROR', {'error': str(e), 'operation': 'get_price_ranges'})
            return []
    
    def log_event(self, invoice_id: Optional[str], line_item_id: Optional[str], 
                  stage: str, payload: Dict[str, Any]):
        """Log agent event to agent_events table"""
        try:
            # Hash sensitive data
            safe_payload = self._sanitize_payload(payload)
            
            event_data = {
                'invoice_id': invoice_id,
                'line_item_id': line_item_id,
                'stage': stage,
                'payload': safe_payload,
                'created_at': datetime.utcnow().isoformat()
            }
            
            if not self.dry_run:
                self.client.table('agent_events').insert(event_data).execute()
        except Exception as e:
            # Fail silently for logging to avoid breaking main flow
            pass
    
    def create_proposal(self, proposal_type: str, payload: Dict[str, Any], 
                       created_by: str = 'agent') -> Optional[str]:
        """Create a proposal in agent_proposals table"""
        if self.dry_run:
            # In dry run, just log the proposal
            proposal_id = str(uuid.uuid4())
            self.log_event(None, None, 'PROPOSAL_DRY_RUN', {
                'proposal_id': proposal_id,
                'type': proposal_type,
                'payload_keys': list(payload.keys())
            })
            return proposal_id
        
        try:
            proposal_data = {
                'proposal_type': proposal_type,
                'payload': payload,
                'status': 'PENDING',
                'created_by': created_by,
                'created_at': datetime.utcnow().isoformat()
            }
            
            response = self.client.table('agent_proposals').insert(proposal_data).execute()
            return response.data[0]['id'] if response.data else None
        except Exception as e:
            self.log_event(None, None, 'ERROR', {'error': str(e), 'operation': 'create_proposal'})
            return None
    
    def _sanitize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Remove sensitive data from payload for logging"""
        safe_payload = payload.copy()
        
        # Hash vendor_id if present
        if 'vendor_id' in safe_payload:
            safe_payload['vendor_id_hash'] = hashlib.sha256(
                safe_payload.pop('vendor_id').encode()
            ).hexdigest()[:16]
        
        # Remove raw descriptions and prices, keep metadata
        if 'description' in safe_payload:
            safe_payload['description_length'] = len(safe_payload.pop('description'))
        
        if 'unit_price' in safe_payload:
            safe_payload['price_present'] = True
            safe_payload.pop('unit_price')
        
        if 'items' in safe_payload and isinstance(safe_payload['items'], list):
            safe_payload['item_count'] = len(safe_payload['items'])
            safe_payload.pop('items')
        
        return safe_payload