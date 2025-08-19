import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from .db import get_supabase

def save_validation_run(result: Dict[str, Any], payload: Dict[str, Any]) -> Optional[str]:
    """
    Saves validation run to invoice_validations and invoice_line_items tables.
    
    Args:
        result: Validation result from real validator
        payload: Original invoice payload
        
    Returns:
        New invoice UUID (string) or None on failure
    """
    try:
        supabase = get_supabase()
        
        # Generate unique invoice ID
        invoice_id = str(uuid.uuid4())
        
        # Prepare main invoice validation record
        invoice_data = {
            "invoice_id": invoice_id,
            "scope_of_work": payload.get("scope_of_work", ""),
            "service_line_id": payload.get("service_line_id"),
            "service_type_id": payload.get("service_type_id"),
            "labor_hours": payload.get("labor_hours", 0),
            "invoice_status": result.get("invoice_status", "UNKNOWN"),
            "mode": result.get("mode", "unknown"),
            "total_lines": result.get("summary", {}).get("total_lines", 0),
            "allow_count": result.get("summary", {}).get("allow", 0),
            "review_count": result.get("summary", {}).get("needs_review", 0),
            "reject_count": result.get("summary", {}).get("reject", 0),
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Insert main invoice validation record
        invoice_response = supabase.table("invoice_validations").insert(invoice_data).execute()
        
        if not invoice_response.data:
            return None
            
        # Prepare line items data
        line_items = []
        for line in result.get("lines", []):
            line_item = {
                "invoice_id": invoice_id,
                "line_type": line.get("type", "unknown"),
                "line_index": line.get("index", 0),
                "item_name": line.get("input", {}).get("name", "") if line.get("type") != "labor" else "Labor Hours",
                "quantity": line.get("input", {}).get("quantity", 0) if line.get("type") != "labor" else line.get("input", {}).get("hours", 0),
                "unit": line.get("input", {}).get("unit", "") if line.get("type") != "labor" else "hours",
                "unit_price": line.get("input", {}).get("unit_price", 0) if line.get("type") != "labor" else 0,
                "line_status": line.get("status", "UNKNOWN"),
                "reason_codes": line.get("reason_codes", []),
                "canonical_match": line.get("match", {}).get("canonical") if line.get("match") else None,
                "match_confidence": line.get("match", {}).get("confidence") if line.get("match") else None,
                "price_min": line.get("pricing", {}).get("min") if line.get("pricing") else None,
                "price_max": line.get("pricing", {}).get("max") if line.get("pricing") else None
            }
            line_items.append(line_item)
        
        # Insert line items if any exist
        if line_items:
            line_items_response = supabase.table("invoice_line_items").insert(line_items).execute()
            if not line_items_response.data:
                # Line items failed but main record succeeded - could be partial success
                # Return the invoice_id but this indicates a warning state
                return invoice_id
        
        return invoice_id
        
    except Exception as e:
        # Log error in production - for now just return None to indicate failure
        print(f"Failed to save validation run: {e}")
        return None