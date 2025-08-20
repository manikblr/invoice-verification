from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import rapidfuzz
from .supabase_tool import SupabaseTool, CanonicalItem, Synonym


@dataclass
class MatchResult:
    canonical_item_id: Optional[str]
    canonical_name: Optional[str]
    confidence: float
    match_type: str  # 'exact', 'synonym', 'fuzzy', 'none'
    proposal_id: Optional[str] = None


class MatchingTool:
    def __init__(self, supabase_tool: SupabaseTool):
        self.supabase = supabase_tool
        self._canonical_cache: Optional[List[CanonicalItem]] = None
        self._synonym_cache: Optional[List[Synonym]] = None
    
    def _get_canonical_items(self) -> List[CanonicalItem]:
        """Get cached canonical items"""
        if self._canonical_cache is None:
            self._canonical_cache = self.supabase.get_canonical_items()
        return self._canonical_cache
    
    def _get_synonyms(self) -> List[Synonym]:
        """Get cached synonyms"""
        if self._synonym_cache is None:
            self._synonym_cache = self.supabase.get_synonyms()
        return self._synonym_cache
    
    def match_item(self, description: str, line_item_id: str) -> MatchResult:
        """
        Hybrid search: exact → synonyms → rapidfuzz fuzzy matching
        """
        description_clean = description.strip().lower()
        
        # Log matching attempt
        self.supabase.log_event(None, line_item_id, 'MATCHING_START', {
            'description_length': len(description),
            'clean_description_length': len(description_clean)
        })
        
        # 1. Try exact match on canonical items
        exact_match = self._try_exact_match(description_clean)
        if exact_match:
            self.supabase.log_event(None, line_item_id, 'MATCH_EXACT', {
                'canonical_item_id': exact_match.canonical_item_id
            })
            return exact_match
        
        # 2. Try synonym match
        synonym_match = self._try_synonym_match(description_clean)
        if synonym_match:
            self.supabase.log_event(None, line_item_id, 'MATCH_SYNONYM', {
                'canonical_item_id': synonym_match.canonical_item_id,
                'confidence': synonym_match.confidence
            })
            return synonym_match
        
        # 3. Try fuzzy match
        fuzzy_match = self._try_fuzzy_match(description_clean, line_item_id)
        if fuzzy_match:
            self.supabase.log_event(None, line_item_id, 'MATCH_FUZZY', {
                'canonical_item_id': fuzzy_match.canonical_item_id,
                'confidence': fuzzy_match.confidence,
                'proposal_created': fuzzy_match.proposal_id is not None
            })
            return fuzzy_match
        
        # 4. No match found
        self.supabase.log_event(None, line_item_id, 'MATCH_NONE', {
            'description_length': len(description)
        })
        
        return MatchResult(
            canonical_item_id=None,
            canonical_name=None,
            confidence=0.0,
            match_type='none'
        )
    
    def _try_exact_match(self, description_clean: str) -> Optional[MatchResult]:
        """Try exact match on canonical item names"""
        canonical_items = self._get_canonical_items()
        
        for item in canonical_items:
            if item.name.lower().strip() == description_clean:
                return MatchResult(
                    canonical_item_id=item.id,
                    canonical_name=item.name,
                    confidence=1.0,
                    match_type='exact'
                )
        return None
    
    def _try_synonym_match(self, description_clean: str) -> Optional[MatchResult]:
        """Try exact match on synonyms"""
        synonyms = self._get_synonyms()
        canonical_items = {item.id: item for item in self._get_canonical_items()}
        
        for synonym in synonyms:
            if synonym.synonym.lower().strip() == description_clean:
                canonical_item = canonical_items.get(synonym.canonical_item_id)
                if canonical_item:
                    return MatchResult(
                        canonical_item_id=synonym.canonical_item_id,
                        canonical_name=canonical_item.name,
                        confidence=synonym.confidence,
                        match_type='synonym'
                    )
        return None
    
    def _try_fuzzy_match(self, description_clean: str, line_item_id: str) -> Optional[MatchResult]:
        """Try fuzzy match using rapidfuzz"""
        canonical_items = self._get_canonical_items()
        
        best_match = None
        best_score = 0.0
        best_item = None
        
        # Check canonical items
        for item in canonical_items:
            score = rapidfuzz.fuzz.ratio(description_clean, item.name.lower()) / 100.0
            if score > best_score:
                best_score = score
                best_match = item.name.lower()
                best_item = item
        
        # Check synonyms for even better matches
        synonyms = self._get_synonyms()
        canonical_lookup = {item.id: item for item in canonical_items}
        
        for synonym in synonyms:
            score = rapidfuzz.fuzz.ratio(description_clean, synonym.synonym.lower()) / 100.0
            if score > best_score:
                canonical_item = canonical_lookup.get(synonym.canonical_item_id)
                if canonical_item:
                    best_score = score
                    best_match = synonym.synonym.lower()
                    best_item = canonical_item
        
        # If confidence is 0.75-0.85, prepare NEW_SYNONYM proposal
        proposal_id = None
        if 0.75 <= best_score <= 0.85 and best_item:
            proposal_payload = {
                'canonical_item_id': best_item.id,
                'synonym': description_clean,
                'confidence': best_score,
                'original_description_length': len(description_clean)
            }
            proposal_id = self.supabase.create_proposal('NEW_SYNONYM', proposal_payload)
        
        if best_score >= 0.6:  # Minimum threshold for fuzzy match
            return MatchResult(
                canonical_item_id=best_item.id,
                canonical_name=best_item.name,
                confidence=best_score,
                match_type='fuzzy',
                proposal_id=proposal_id
            )
        
        return None
    
    def get_match_stats(self) -> Dict[str, Any]:
        """Get current cache statistics"""
        return {
            'canonical_items_count': len(self._get_canonical_items()),
            'synonyms_count': len(self._get_synonyms()),
            'cache_loaded': self._canonical_cache is not None
        }