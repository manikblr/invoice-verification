"""
Name normalization and canonical item matching
"""
import re
from typing import Dict, List, Optional, Tuple
from rapidfuzz import fuzz
from .db import get_supabase_client

def normalize_text(text: str) -> str:
    """Normalize input text for matching."""
    if not text:
        return ""
    
    # Convert to lowercase and strip
    normalized = text.lower().strip()
    
    # Remove bullets, numbers, punctuation from start
    normalized = re.sub(r'^[\s•\-\–\—\*\d\)\(\.\s]+', '', normalized)
    
    # Collapse multiple spaces
    normalized = re.sub(r'\s+', ' ', normalized)
    
    return normalized.strip()

def find_canonical_item(raw_name: str, item_kind: str) -> Tuple[Optional[str], Optional[str], float]:
    """
    Find canonical item by name and kind.
    Returns (canonical_item_id, canonical_name, confidence_score)
    """
    if not raw_name or not item_kind:
        return None, None, 0.0
    
    client = get_supabase_client()
    normalized_input = normalize_text(raw_name)
    
    try:
        # First try direct canonical item match
        result = client.table('canonical_items') \
            .select('id, canonical_name') \
            .eq('kind', item_kind) \
            .execute()
        
        if not result.data:
            return None, None, 0.0
        
        # Try exact match first
        for item in result.data:
            if normalize_text(item['canonical_name']) == normalized_input:
                return str(item['id']), item['canonical_name'], 0.98
        
        # Then try synonym matches
        synonym_result = client.table('item_synonyms') \
            .select('canonical_item_id, synonym, weight, canonical_items(canonical_name, kind)') \
            .execute()
        
        best_score = 0.0
        best_match = None
        best_id = None
        
        # Check synonyms first (they have explicit weights)
        for syn in synonym_result.data or []:
            if syn['canonical_items']['kind'] == item_kind:
                syn_score = fuzz.token_set_ratio(normalized_input, normalize_text(syn['synonym'])) / 100.0
                # Weight by synonym confidence
                weighted_score = syn_score * syn['weight']
                
                if weighted_score > best_score and syn_score >= 0.85:
                    best_score = weighted_score
                    best_match = syn['canonical_items']['canonical_name']
                    best_id = str(syn['canonical_item_id'])
        
        # If no good synonym match, fall back to fuzzy matching canonical names
        if best_score < 0.85:
            for item in result.data:
                score = fuzz.token_set_ratio(normalized_input, normalize_text(item['canonical_name'])) / 100.0
                if score > best_score and score >= 0.86:
                    best_score = score
                    best_match = item['canonical_name']
                    best_id = str(item['id'])
        
        if best_match:
            return best_id, best_match, best_score
        
        return None, None, 0.0
        
    except Exception:
        return None, None, 0.0