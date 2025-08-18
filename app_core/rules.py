"""
Business rules engine for invoice validation
"""
from typing import Dict, List, Any
from collections import defaultdict
from .db import get_supabase_client

def load_business_rules() -> List[Dict]:
    """Load all business rules from database."""
    client = get_supabase_client()
    
    try:
        result = client.table('item_rules') \
            .select('rule_type, a_item_id, b_item_id, max_qty, rationale') \
            .execute()
        
        return result.data or []
    except Exception:
        return []

def validate_business_rules(line_items: List[Dict]) -> List[Dict]:
    """
    Validate line items against business rules.
    Returns list of rule violations.
    """
    violations = []
    rules = load_business_rules()
    
    if not rules:
        return violations
    
    # Group line items by canonical_item_id for analysis
    item_counts = defaultdict(float)
    item_names = {}
    items_present = set()
    
    for item in line_items:
        canonical_id = item.get('canonical_item_id')
        if canonical_id:
            item_counts[canonical_id] += float(item.get('quantity', 0))
            item_names[canonical_id] = item.get('canonical_name', item.get('raw_name', 'Unknown'))
            items_present.add(canonical_id)
    
    # Check each rule
    for rule in rules:
        rule_type = rule['rule_type']
        a_item_id = rule['a_item_id']
        b_item_id = rule.get('b_item_id')
        rationale = rule.get('rationale', '')
        
        if rule_type == 'MAX_QTY':
            max_qty = rule.get('max_qty', 1)
            if a_item_id in item_counts and item_counts[a_item_id] > max_qty:
                violations.append({
                    "rule_type": "MAX_QTY",
                    "item_name": item_names.get(a_item_id, 'Unknown'),
                    "actual_qty": item_counts[a_item_id],
                    "max_qty": max_qty,
                    "rationale": rationale
                })
        
        elif rule_type == 'CANNOT_DUPLICATE':
            if a_item_id in item_counts and item_counts[a_item_id] > 1:
                violations.append({
                    "rule_type": "CANNOT_DUPLICATE",
                    "item_name": item_names.get(a_item_id, 'Unknown'),
                    "actual_qty": item_counts[a_item_id],
                    "rationale": rationale
                })
        
        elif rule_type == 'MUTEX':
            if a_item_id in items_present and b_item_id in items_present:
                violations.append({
                    "rule_type": "MUTEX",
                    "item_a": item_names.get(a_item_id, 'Unknown'),
                    "item_b": item_names.get(b_item_id, 'Unknown'),
                    "rationale": rationale
                })
        
        elif rule_type == 'REQUIRES':
            if a_item_id in items_present and b_item_id not in items_present:
                violations.append({
                    "rule_type": "REQUIRES",
                    "item_a": item_names.get(a_item_id, 'Unknown'),
                    "required_item": item_names.get(b_item_id, 'Unknown'),
                    "rationale": rationale
                })
    
    return violations