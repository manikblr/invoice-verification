"""
Full invoice validation orchestrator
"""
from typing import Dict, List, Any, Optional
from .matching import find_canonical_item
from .pricing import validate_price
from .rules import validate_business_rules

def validate_invoice(invoice_data: Dict) -> Dict[str, Any]:
    """
    Orchestrate full invoice validation including matching, pricing, and rules.
    
    Expected invoice_data structure:
    {
        "scope_of_work": str,
        "service_line": str,
        "service_type": str, 
        "labor_hours": float,
        "currency": str,
        "line_items": [
            {
                "line_type": "material|equipment|labor",
                "raw_name": str,
                "unit": str,
                "quantity": float,
                "unit_price": float
            }
        ]
    }
    """
    
    # Extract basic info
    scope_of_work = invoice_data.get('scope_of_work', '')
    service_line = invoice_data.get('service_line', '')
    service_type = invoice_data.get('service_type', '')
    labor_hours = invoice_data.get('labor_hours', 0)
    currency = invoice_data.get('currency', 'INR')
    line_items = invoice_data.get('line_items', [])
    
    # Validate each line item
    validated_items = []
    overall_issues = []
    
    for i, item in enumerate(line_items):
        line_type = item.get('line_type', '')
        raw_name = item.get('raw_name', '')
        unit = item.get('unit', '')
        quantity = item.get('quantity', 0)
        unit_price = item.get('unit_price')
        
        # Matching
        canonical_id, canonical_name, match_confidence = find_canonical_item(raw_name, line_type)
        
        # Pricing validation
        price_validation = {"status": "no_price_check"}
        if unit_price is not None and canonical_id:
            price_validation = validate_price(unit_price, canonical_id, currency)
        elif unit_price is not None:
            price_validation = {"status": "no_canonical_item", "note": "Cannot validate price without canonical item"}
        
        # Determine line item status
        line_status = "NEEDS_REVIEW"  # Default
        reasons = []
        
        if canonical_id and match_confidence >= 0.95:
            line_status = "ALLOW"
            reasons.append("High confidence canonical match")
        elif canonical_id and match_confidence >= 0.85:
            line_status = "ALLOW" 
            reasons.append("Good canonical match")
        elif canonical_id:
            reasons.append("Low confidence canonical match")
        else:
            reasons.append("No canonical item match found")
        
        # Adjust based on pricing
        if price_validation.get('status') == 'out_of_band':
            line_status = "NEEDS_REVIEW"
            reasons.append("Price far outside expected range")
        elif price_validation.get('status') == 'borderline':
            if line_status == "ALLOW":
                line_status = "NEEDS_REVIEW"
            reasons.append("Price slightly outside expected range")
        elif price_validation.get('status') == 'in_band':
            if line_status == "NEEDS_REVIEW" and canonical_id:
                line_status = "ALLOW"
                reasons.append("Price within expected range")
        
        validated_item = {
            "position": i + 1,
            "line_type": line_type,
            "raw_name": raw_name,
            "canonical_item_id": canonical_id,
            "canonical_name": canonical_name,
            "match_confidence": round(match_confidence, 3),
            "unit": unit,
            "quantity": quantity,
            "unit_price": unit_price,
            "line_total": quantity * (unit_price or 0),
            "status": line_status,
            "reasons": reasons,
            "price_validation": price_validation
        }
        
        validated_items.append(validated_item)
    
    # Business rules validation
    rule_violations = validate_business_rules(validated_items)
    
    # Overall invoice status
    has_rejections = any(item['status'] == 'REJECT' for item in validated_items)
    has_reviews = any(item['status'] == 'NEEDS_REVIEW' for item in validated_items)
    has_rule_violations = len(rule_violations) > 0
    
    if has_rejections or has_rule_violations:
        overall_status = "REJECT"
    elif has_reviews:
        overall_status = "NEEDS_REVIEW"
    else:
        overall_status = "ALLOW"
    
    # Calculate totals
    total_amount = sum(item['line_total'] for item in validated_items)
    
    return {
        "overall_status": overall_status,
        "scope_of_work": scope_of_work,
        "service_line": service_line,
        "service_type": service_type,
        "labor_hours": labor_hours,
        "currency": currency,
        "total_amount": total_amount,
        "line_items": validated_items,
        "rule_violations": rule_violations,
        "summary": {
            "total_line_items": len(validated_items),
            "material_count": len([i for i in validated_items if i['line_type'] == 'material']),
            "equipment_count": len([i for i in validated_items if i['line_type'] == 'equipment']),
            "labor_count": len([i for i in validated_items if i['line_type'] == 'labor']),
            "resolved_items": len([i for i in validated_items if i['canonical_item_id']]),
            "unresolved_items": len([i for i in validated_items if not i['canonical_item_id']]),
            "rule_violations": len(rule_violations)
        }
    }