from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum
from .supabase_tool import SupabaseTool


class Decision(Enum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    NEEDS_MORE_INFO = "NEEDS_MORE_INFO"


@dataclass
class RuleResult:
    decision: Decision
    reasons: List[str]
    policy_codes: List[str]
    facts: Dict[str, Any]
    confidence: float


class RulesTool:
    def __init__(self, supabase_tool: SupabaseTool):
        self.supabase = supabase_tool
        self._price_ranges_cache: Optional[Dict[str, Dict[str, float]]] = None
        self._rules_cache: Optional[List[Dict[str, Any]]] = None
    
    def apply_rules(self, canonical_item_id: Optional[str], unit_price: float, 
                   quantity: int, match_confidence: float, price_is_valid: bool,
                   line_item_id: str, vendor_id: str) -> RuleResult:
        """
        Deterministic rule application with stable policy codes
        Returns decision with policy-coded reasons
        """
        policy_codes = []
        facts = {
            'unit_price': unit_price,
            'quantity': quantity,
            'match_confidence': match_confidence
        }
        decision = Decision.ALLOW
        confidence = 1.0
        
        # Rule 1: NO_CANONICAL_MATCH
        if canonical_item_id is None:
            policy_codes.append("NO_CANONICAL_MATCH")
            decision = Decision.NEEDS_MORE_INFO
            confidence = 0.9
        else:
            facts['canonical_item_id'] = canonical_item_id
            
            # Get price band for canonical item
            price_band = self._get_price_band(canonical_item_id)
            
            # Rule 2: NO_PRICE_BAND
            if price_band is None:
                policy_codes.append("NO_PRICE_BAND")
                decision = Decision.NEEDS_MORE_INFO
                confidence = 0.8
            else:
                facts['price_band_min'] = price_band['min_price']
                facts['price_band_max'] = price_band['max_price']
                
                # Rule 3: PRICE_EXCEEDS_MAX_150
                max_allowed = price_band['max_price'] * 1.5
                if unit_price > max_allowed:
                    policy_codes.append("PRICE_EXCEEDS_MAX_150")
                    facts['max_allowed_150'] = max_allowed
                    decision = Decision.DENY
                    confidence = 0.95
                
                # Rule 4: PRICE_BELOW_MIN_50
                elif price_band['min_price'] > 0 and unit_price < (price_band['min_price'] * 0.5):
                    min_allowed = price_band['min_price'] * 0.5
                    policy_codes.append("PRICE_BELOW_MIN_50")
                    facts['min_allowed_50'] = min_allowed
                    decision = Decision.DENY
                    confidence = 0.95
        
        # Rule 5: VENDOR_EXCLUDED_BY_RULE
        excluded_rule_id = self._check_vendor_exclusion(vendor_id)
        if excluded_rule_id:
            policy_codes.append(f"VENDOR_EXCLUDED_BY_RULE:{excluded_rule_id}")
            facts['excluded_rule_id'] = excluded_rule_id
            decision = Decision.DENY
            confidence = 1.0
        
        # Rule 6: QUANTITY_OVER_LIMIT
        quantity_rule_id = self._check_quantity_limits(canonical_item_id, quantity)
        if quantity_rule_id:
            policy_codes.append(f"QUANTITY_OVER_LIMIT:{quantity_rule_id}")
            facts['quantity_rule_id'] = quantity_rule_id
            decision = Decision.DENY
            confidence = 1.0
        
        # Rule 7: BLACKLISTED_ITEM
        blacklist_rule_id = self._check_item_blacklist(canonical_item_id)
        if blacklist_rule_id:
            policy_codes.append(f"BLACKLISTED_ITEM:{blacklist_rule_id}")
            facts['blacklist_rule_id'] = blacklist_rule_id
            decision = Decision.DENY
            confidence = 1.0
        
        # Generate reasons from policy codes
        reasons = [self._explain(code, facts) for code in policy_codes]
        
        # If no blocking rules, allow
        if not policy_codes:
            decision = Decision.ALLOW
            confidence = 1.0
        
        # Log rule application with sanitized facts
        self.supabase.log_event(None, line_item_id, 'RULES_APPLIED', {
            'canonical_item_id': canonical_item_id,
            'decision': decision.value,
            'policy_codes': policy_codes,
            'facts_keys': list(facts.keys()),
            'vendor_id': vendor_id  # Will be hashed by supabase_tool
        })
        
        return RuleResult(
            decision=decision,
            reasons=reasons,
            policy_codes=policy_codes,
            facts=facts,
            confidence=confidence
        )
    
    def _get_price_band(self, canonical_item_id: str) -> Optional[Dict[str, float]]:
        """Get price band for canonical item"""
        if self._price_ranges_cache is None:
            self._load_price_ranges()
        return self._price_ranges_cache.get(canonical_item_id)
    
    def _load_price_ranges(self):
        """Load price ranges from database"""
        try:
            response = self.supabase.client.table('item_price_ranges').select('*').execute()
            self._price_ranges_cache = {
                row['canonical_item_id']: {
                    'min_price': float(row['min_price']),
                    'max_price': float(row['max_price'])
                }
                for row in response.data
            }
        except Exception as e:
            self.supabase.log_event(None, None, 'ERROR', {
                'error': str(e), 
                'operation': 'load_price_ranges'
            })
            self._price_ranges_cache = {}
    
    def _check_vendor_exclusion(self, vendor_id: str) -> Optional[str]:
        """Check if vendor is excluded by rules"""
        # Stub implementation - would check business_rules table
        # For now, return None (no exclusion)
        return None
    
    def _check_quantity_limits(self, canonical_item_id: Optional[str], quantity: int) -> Optional[str]:
        """Check quantity limits from rules"""
        # Stub implementation - would check business_rules table
        # For now, return None (no limit exceeded)
        return None
    
    def _check_item_blacklist(self, canonical_item_id: Optional[str]) -> Optional[str]:
        """Check if item is blacklisted"""
        # Stub implementation - would check business_rules table
        # For now, return None (not blacklisted)
        return None
    
    def _explain(self, policy_code: str, facts: Dict[str, Any]) -> str:
        """Generate human-readable explanation for policy code"""
        if policy_code == "NO_CANONICAL_MATCH":
            return "No matching catalog item found for this description"
        
        elif policy_code == "NO_PRICE_BAND":
            return "No price range data available for this item"
        
        elif policy_code == "PRICE_EXCEEDS_MAX_150":
            price = facts.get('unit_price', 0)
            max_allowed = facts.get('max_allowed_150', 0)
            band_max = facts.get('price_band_max', 0)
            return f"Price {price} exceeds allowed max 1.5× (cap {max_allowed:.2f}, band max {band_max:.2f})"
        
        elif policy_code == "PRICE_BELOW_MIN_50":
            price = facts.get('unit_price', 0)
            min_allowed = facts.get('min_allowed_50', 0)
            band_min = facts.get('price_band_min', 0)
            return f"Price {price} below allowed min 0.5× (floor {min_allowed:.2f}, band min {band_min:.2f})"
        
        elif policy_code.startswith("VENDOR_EXCLUDED_BY_RULE:"):
            rule_id = policy_code.split(":", 1)[1]
            return f"Vendor excluded by business rule {rule_id}"
        
        elif policy_code.startswith("QUANTITY_OVER_LIMIT:"):
            rule_id = policy_code.split(":", 1)[1]
            qty = facts.get('quantity', 0)
            return f"Quantity {qty} exceeds limit defined in rule {rule_id}"
        
        elif policy_code.startswith("BLACKLISTED_ITEM:"):
            rule_id = policy_code.split(":", 1)[1]
            return f"Item blacklisted by rule {rule_id}"
        
        else:
            return f"Policy violation: {policy_code}"
    
    def get_rule_stats(self) -> Dict[str, Any]:
        """Get rule engine statistics"""
        return {
            'rule_engine_version': '2.0.0',
            'deterministic_rules_count': 7,
            'llm_rules_enabled': False,
            'policy_codes_available': [
                'NO_CANONICAL_MATCH',
                'NO_PRICE_BAND',
                'PRICE_EXCEEDS_MAX_150',
                'PRICE_BELOW_MIN_50',
                'VENDOR_EXCLUDED_BY_RULE:<rule_id>',
                'QUANTITY_OVER_LIMIT:<rule_id>',
                'BLACKLISTED_ITEM:<rule_id>'
            ]
        }
    
    def explain_decision(self, rule_result: RuleResult) -> str:
        """Generate human-readable explanation of decision"""
        decision_text = rule_result.decision.value.replace('_', ' ').title()
        
        explanation = f"Decision: {decision_text} (Confidence: {rule_result.confidence:.1%})\n"
        
        if rule_result.reasons:
            explanation += "Reasons:\n"
            for i, reason in enumerate(rule_result.reasons, 1):
                explanation += f"  {i}. {reason}\n"
        
        if rule_result.policy_codes:
            explanation += f"Policy Codes: {', '.join(rule_result.policy_codes)}\n"
        
        return explanation.strip()
    
    def create_rule_proposal(self, rule_type: str, conditions: Dict[str, Any], 
                           actions: Dict[str, Any], description: str) -> Optional[str]:
        """Create a new rule proposal"""
        proposal_payload = {
            'rule_type': rule_type,
            'conditions': conditions,
            'actions': actions,
            'description': description,
            'proposed_by': 'rules_engine'
        }
        
        return self.supabase.create_proposal('NEW_RULE', proposal_payload)