from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from .supabase_tool import SupabaseTool, PriceRange


@dataclass
class PriceValidationResult:
    is_valid: bool
    canonical_item_id: Optional[str]
    unit_price: float
    expected_range: Optional[tuple]  # (min, max)
    variance_percent: Optional[float]
    proposal_id: Optional[str] = None


class PricingTool:
    def __init__(self, supabase_tool: SupabaseTool):
        self.supabase = supabase_tool
        self._price_range_cache: Optional[Dict[str, PriceRange]] = None
        self.variance_threshold = 0.20  # 20% variance threshold
    
    def _get_price_ranges(self) -> Dict[str, PriceRange]:
        """Get cached price ranges by canonical_item_id"""
        if self._price_range_cache is None:
            ranges = self.supabase.get_price_ranges()
            self._price_range_cache = {
                range_item.canonical_item_id: range_item 
                for range_item in ranges
            }
        return self._price_range_cache
    
    def validate_price(self, canonical_item_id: Optional[str], unit_price: float, 
                      line_item_id: str) -> PriceValidationResult:
        """
        Validate price against expected ranges and flag out-of-band prices
        """
        if canonical_item_id is None:
            # No canonical item to validate against
            self.supabase.log_event(None, line_item_id, 'PRICE_NO_CANONICAL', {
                'price_present': True
            })
            return PriceValidationResult(
                is_valid=True,  # Can't validate without canonical item
                canonical_item_id=None,
                unit_price=unit_price,
                expected_range=None,
                variance_percent=None
            )
        
        price_ranges = self._get_price_ranges()
        price_range = price_ranges.get(canonical_item_id)
        
        if price_range is None:
            # No price range data available
            self.supabase.log_event(None, line_item_id, 'PRICE_NO_RANGE_DATA', {
                'canonical_item_id': canonical_item_id,
                'price_present': True
            })
            return PriceValidationResult(
                is_valid=True,  # Can't validate without range data
                canonical_item_id=canonical_item_id,
                unit_price=unit_price,
                expected_range=None,
                variance_percent=None
            )
        
        # Calculate variance
        min_price, max_price = price_range.min_price, price_range.max_price
        expected_range = (min_price, max_price)
        
        # Check if price is within range
        is_within_range = min_price <= unit_price <= max_price
        
        # Calculate percentage variance from range
        if unit_price < min_price:
            variance_percent = (min_price - unit_price) / min_price
        elif unit_price > max_price:
            variance_percent = (unit_price - max_price) / max_price
        else:
            variance_percent = 0.0
        
        proposal_id = None
        
        # Create proposal if variance is significant
        if variance_percent > self.variance_threshold:
            # Suggest range adjustment
            if unit_price < min_price:
                new_min = unit_price * 0.95  # 5% buffer below
                new_range = [new_min, max_price]
                reason = f"Price {unit_price} below current min {min_price}"
            else:  # unit_price > max_price
                new_max = unit_price * 1.05  # 5% buffer above
                new_range = [min_price, new_max]
                reason = f"Price {unit_price} above current max {max_price}"
            
            proposal_payload = {
                'canonical_item_id': canonical_item_id,
                'old_range': [min_price, max_price],
                'new_range': new_range,
                'reason': reason,
                'variance_percent': variance_percent,
                'triggering_price': unit_price
            }
            proposal_id = self.supabase.create_proposal('PRICE_RANGE_ADJUST', proposal_payload)
        
        # Log price validation event
        self.supabase.log_event(None, line_item_id, 'PRICE_VALIDATION', {
            'canonical_item_id': canonical_item_id,
            'is_within_range': is_within_range,
            'variance_percent': variance_percent,
            'proposal_created': proposal_id is not None
        })
        
        return PriceValidationResult(
            is_valid=is_within_range,
            canonical_item_id=canonical_item_id,
            unit_price=unit_price,
            expected_range=expected_range,
            variance_percent=variance_percent,
            proposal_id=proposal_id
        )
    
    def get_price_stats(self) -> Dict[str, Any]:
        """Get pricing statistics"""
        price_ranges = self._get_price_ranges()
        
        if not price_ranges:
            return {'price_ranges_count': 0, 'cache_loaded': False}
        
        prices = []
        for range_item in price_ranges.values():
            prices.extend([range_item.min_price, range_item.max_price])
        
        return {
            'price_ranges_count': len(price_ranges),
            'avg_min_price': sum(r.min_price for r in price_ranges.values()) / len(price_ranges),
            'avg_max_price': sum(r.max_price for r in price_ranges.values()) / len(price_ranges),
            'cache_loaded': self._price_range_cache is not None
        }
    
    def suggest_price_range(self, canonical_item_id: str, observed_prices: List[float]) -> Optional[Dict[str, Any]]:
        """Suggest a price range based on observed prices"""
        if not observed_prices:
            return None
        
        observed_prices.sort()
        min_observed = observed_prices[0]
        max_observed = observed_prices[-1]
        
        # Add 10% buffer on each side
        suggested_min = min_observed * 0.9
        suggested_max = max_observed * 1.1
        
        return {
            'canonical_item_id': canonical_item_id,
            'suggested_range': [suggested_min, suggested_max],
            'observed_prices': observed_prices,
            'sample_size': len(observed_prices)
        }