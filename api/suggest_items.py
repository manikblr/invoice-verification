import os
import re
import time
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from functools import lru_cache
from collections import defaultdict

from flask import Flask, request, jsonify
import rapidfuzz
from agents.tools.supabase_tool import SupabaseTool

app = Flask(__name__)

@dataclass
class SuggestionItem:
    canonical_item_id: str
    display_name: str
    score: int
    sample_price_band: Optional[Dict[str, float]] = None

class SuggestEngine:
    def __init__(self):
        self.supabase = SupabaseTool()
        self._canonicals_cache: Optional[Dict[str, str]] = None  # id -> name
        self._synonyms_cache: Optional[Dict[str, List[str]]] = None  # canonical_id -> [synonyms]
        self._price_bands_cache: Optional[Dict[str, Dict[str, float]]] = None
        self._cache_timestamp = 0
        self.cache_ttl = 300  # 5 minutes for data cache
        
        # In-memory suggestion cache (60s TTL)
        self._suggestion_cache: Dict[Tuple[str, Optional[str]], Tuple[List[SuggestionItem], float]] = {}
        self.suggestion_cache_ttl = 60
    
    def _normalize_query(self, query: str) -> str:
        """Normalize query: lowercase, trim, collapse spaces"""
        return re.sub(r'\s+', ' ', query.lower().strip())
    
    def _should_refresh_cache(self) -> bool:
        """Check if data cache needs refresh"""
        return time.time() - self._cache_timestamp > self.cache_ttl
    
    def _load_data(self):
        """Load and cache all reference data"""
        if not self._should_refresh_cache():
            return
            
        # Load canonical items
        canonicals = self.supabase.get_canonical_items()
        self._canonicals_cache = {item.id: item.name for item in canonicals}
        
        # Load synonyms
        synonyms = self.supabase.get_synonyms()
        self._synonyms_cache = defaultdict(list)
        for synonym in synonyms:
            self._synonyms_cache[synonym.canonical_item_id].append(synonym.synonym)
        
        # Load price bands
        try:
            response = self.supabase.client.table('item_price_ranges').select('*').execute()
            self._price_bands_cache = {}
            for row in response.data:
                self._price_bands_cache[row['canonical_item_id']] = {
                    'min': float(row['min_price']),
                    'p50': float(row.get('p50_price', row.get('avg_price', 
                                       (float(row['min_price']) + float(row['max_price'])) / 2))),
                    'max': float(row['max_price'])
                }
        except Exception as e:
            self.supabase.log_event(None, None, 'ERROR', {
                'error': str(e), 
                'operation': 'load_price_bands_suggest'
            })
            self._price_bands_cache = {}
        
        self._cache_timestamp = time.time()
    
    def _get_popularity_scores(self) -> Dict[str, int]:
        """Get popularity scores from recent invoice line items (180 days)"""
        try:
            cutoff_date = (datetime.now() - timedelta(days=180)).isoformat()
            response = self.supabase.client.table('invoice_line_items')\
                .select('canonical_item_id')\
                .gte('created_at', cutoff_date)\
                .execute()
            
            # Count occurrences
            counts = defaultdict(int)
            for row in response.data:
                if row['canonical_item_id']:
                    counts[row['canonical_item_id']] += 1
            
            # Normalize to 0-100 scale
            if not counts:
                return {}
            
            max_count = max(counts.values())
            return {
                canonical_id: int(100 * count / max_count)
                for canonical_id, count in counts.items()
            }
        except Exception as e:
            self.supabase.log_event(None, None, 'ERROR', {
                'error': str(e), 
                'operation': 'get_popularity_scores'
            })
            return {}
    
    def _get_vendor_boost_items(self, vendor_id: Optional[str]) -> set:
        """Get items used by vendor in last 90 days"""
        if not vendor_id:
            return set()
        
        try:
            cutoff_date = (datetime.now() - timedelta(days=90)).isoformat()
            # This is a simplified query - in production would need proper vendor linkage
            # For now, return empty set as we don't have vendor->invoice mapping in schema
            return set()
        except Exception as e:
            self.supabase.log_event(None, None, 'ERROR', {
                'error': str(e), 
                'operation': 'get_vendor_boost'
            })
            return set()
    
    def _match_items(self, normalized_query: str) -> List[Tuple[str, str, int]]:
        """Match items using rapidfuzz. Returns [(canonical_id, display_name, score)]"""
        if not self._canonicals_cache or not self._synonyms_cache:
            return []
        
        matches = []
        
        # Search canonical names
        for canonical_id, canonical_name in self._canonicals_cache.items():
            score = rapidfuzz.fuzz.token_set_ratio(normalized_query, canonical_name.lower())
            if score >= 50:  # Minimum threshold
                matches.append((canonical_id, canonical_name, score))
        
        # Search synonyms
        best_synonym_matches = {}  # canonical_id -> (best_synonym, best_score)
        for canonical_id, synonyms in self._synonyms_cache.items():
            for synonym in synonyms:
                score = rapidfuzz.fuzz.token_set_ratio(normalized_query, synonym.lower())
                if score >= 50:
                    if canonical_id not in best_synonym_matches or score > best_synonym_matches[canonical_id][1]:
                        best_synonym_matches[canonical_id] = (synonym, score)
        
        # Combine synonym matches, keeping best display name per canonical
        canonical_scores = {}  # canonical_id -> (display_name, score)
        
        # Add canonical matches
        for canonical_id, display_name, score in matches:
            canonical_scores[canonical_id] = (display_name, score)
        
        # Add/update with better synonym matches
        for canonical_id, (synonym, score) in best_synonym_matches.items():
            if canonical_id not in canonical_scores or score > canonical_scores[canonical_id][1]:
                canonical_scores[canonical_id] = (synonym, score)
        
        return [(cid, name, score) for cid, (name, score) in canonical_scores.items()]
    
    def suggest(self, query: str, vendor_id: Optional[str] = None, limit: int = 8) -> List[SuggestionItem]:
        """Generate suggestions for query"""
        
        # Normalize query
        normalized_query = self._normalize_query(query)
        
        # Check suggestion cache
        cache_key = (normalized_query, vendor_id)
        if cache_key in self._suggestion_cache:
            cached_items, cache_time = self._suggestion_cache[cache_key]
            if time.time() - cache_time < self.suggestion_cache_ttl:
                return cached_items[:limit]
        
        # Load fresh data if needed
        self._load_data()
        
        # Get auxiliary scoring data
        popularity_scores = self._get_popularity_scores()
        vendor_boost_items = self._get_vendor_boost_items(vendor_id)
        
        # Match items
        raw_matches = self._match_items(normalized_query)
        if not raw_matches:
            return []
        
        # Score and rank
        suggestions = []
        for canonical_id, display_name, fuzzy_score in raw_matches:
            
            # Popularity component (0-100)
            popularity = popularity_scores.get(canonical_id, 0)
            
            # Vendor boost (+15 if used by vendor recently)
            vendor_boost = 15 if canonical_id in vendor_boost_items else 0
            
            # Price band bonus (+5 if band exists)
            band_bonus = 5 if canonical_id in (self._price_bands_cache or {}) else 0
            
            # Final score: 0.6*fuzzy + 0.2*popularity + 0.2*vendor_boost + band_bonus
            final_score = round(0.6 * fuzzy_score + 0.2 * popularity + 0.2 * vendor_boost) + band_bonus
            final_score = max(0, min(100, final_score))  # Clamp 0-100
            
            # Get price band if available
            price_band = None
            if self._price_bands_cache and canonical_id in self._price_bands_cache:
                price_band = self._price_bands_cache[canonical_id]
            
            suggestions.append(SuggestionItem(
                canonical_item_id=canonical_id,
                display_name=display_name,
                score=final_score,
                sample_price_band=price_band
            ))
        
        # Sort by score descending
        suggestions.sort(key=lambda x: x.score, reverse=True)
        
        # Cache result
        self._suggestion_cache[cache_key] = (suggestions, time.time())
        
        # Clean old cache entries periodically
        if len(self._suggestion_cache) > 1000:
            current_time = time.time()
            expired_keys = [
                key for key, (_, cache_time) in self._suggestion_cache.items()
                if current_time - cache_time > self.suggestion_cache_ttl
            ]
            for key in expired_keys:
                del self._suggestion_cache[key]
        
        return suggestions[:limit]

# Global suggestion engine
suggest_engine = SuggestEngine()

@app.route('/api/suggest_items', methods=['GET'])
def suggest_items():
    """
    GET /api/suggest_items?q=<text>&vendor_id=<id>&limit=10
    Returns intuitive item suggestions for typeahead
    """
    
    try:
        # Get query parameter
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({'error': 'Missing required parameter: q'}), 400
        
        if len(query) < 2:
            return jsonify({'error': 'Query must be at least 2 characters'}), 400
        
        if len(query) > 80:
            return jsonify({'error': 'Query too long (max 80 characters)'}), 400
        
        # Get optional parameters
        vendor_id = request.args.get('vendor_id')
        limit = int(request.args.get('limit', 8))
        limit = max(3, min(20, limit))  # Clamp 3-20
        
        # Log request (privacy-safe)
        normalized_query = suggest_engine._normalize_query(query)
        query_hash = hashlib.sha256(normalized_query.encode()).hexdigest()[:16]
        
        suggest_engine.supabase.log_event(None, None, 'SUGGEST_REQUEST', {
            'query_length': len(normalized_query),
            'query_hash': query_hash,
            'vendor_id': vendor_id,  # Will be hashed by supabase_tool
            'limit': limit
        })
        
        # Get suggestions
        suggestions = suggest_engine.suggest(query, vendor_id, limit)
        
        # Format response
        response = {
            'query': normalized_query,
            'suggestions': [
                {
                    'canonical_item_id': item.canonical_item_id,
                    'display_name': item.display_name,
                    'score': item.score,
                    'sample_price_band': item.sample_price_band
                }
                for item in suggestions
            ]
        }
        
        return jsonify(response), 200
        
    except ValueError as e:
        return jsonify({'error': f'Invalid parameter: {str(e)}'}), 400
    except Exception as e:
        # Log error without exposing internals
        suggest_engine.supabase.log_event(None, None, 'SUGGEST_ERROR', {
            'error_type': type(e).__name__
        })
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/suggest_items/health', methods=['GET'])
def suggest_health():
    """Health check for suggest API"""
    try:
        # Quick cache status check
        cache_status = {
            'canonicals_loaded': suggest_engine._canonicals_cache is not None,
            'cache_age_seconds': int(time.time() - suggest_engine._cache_timestamp),
            'suggestion_cache_size': len(suggest_engine._suggestion_cache)
        }
        
        return jsonify({
            'status': 'healthy',
            'cache_status': cache_status
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)