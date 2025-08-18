"""
Price range lookups and validation
"""
from typing import Dict, Optional
from .db import get_supabase_client

def get_price_range(canonical_item_id: str, currency: str = "INR") -> Optional[Dict]:
    """
    Get price range for a canonical item.
    Returns dict with min_price, max_price, currency, source or None if not found.
    """
    if not canonical_item_id:
        return None
    
    client = get_supabase_client()
    
    try:
        result = client.table('item_price_ranges') \
            .select('min_price, max_price, currency, source') \
            .eq('canonical_item_id', canonical_item_id) \
            .eq('currency', currency) \
            .limit(1) \
            .execute()
        
        if result.data:
            return result.data[0]
        
        return None
        
    except Exception:
        return None

def validate_price(proposed_price: float, canonical_item_id: str, currency: str = "INR") -> Dict:
    """
    Validate proposed price against price range.
    Returns validation result with status and details.
    """
    if not canonical_item_id:
        return {"status": "no_item", "note": "No canonical item to check against"}
    
    price_range = get_price_range(canonical_item_id, currency)
    
    if not price_range:
        return {"status": "no_range", "note": "No price range available"}
    
    min_price = price_range.get('min_price')
    max_price = price_range.get('max_price')
    
    if min_price is None or max_price is None:
        return {
            "status": "incomplete_range", 
            "note": "Price range missing min/max values",
            "source": price_range.get('source')
        }
    
    # Price validation tiers
    if proposed_price < 0.60 * min_price or proposed_price > 1.50 * max_price:
        return {
            "status": "out_of_band",
            "note": f"Proposed {currency} {proposed_price:.2f} vs range {currency} {min_price:.2f}-{max_price:.2f}",
            "source": price_range.get('source'),
            "min_price": min_price,
            "max_price": max_price
        }
    elif proposed_price < min_price or proposed_price > max_price:
        return {
            "status": "borderline",
            "note": f"Proposed {currency} {proposed_price:.2f} slightly outside {currency} {min_price:.2f}-{max_price:.2f}",
            "source": price_range.get('source'),
            "min_price": min_price,
            "max_price": max_price
        }
    else:
        return {
            "status": "in_band",
            "note": f"Proposed {currency} {proposed_price:.2f} within {currency} {min_price:.2f}-{max_price:.2f}",
            "source": price_range.get('source'),
            "min_price": min_price,
            "max_price": max_price
        }