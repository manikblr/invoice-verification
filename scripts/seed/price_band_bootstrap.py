"""
Price band bootstrap - computes initial price ranges from invoice history
"""

import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from collections import defaultdict
import statistics

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False


class PriceBandBootstrapper:
    """Bootstraps price ranges from historical invoice data"""
    
    def __init__(self, supabase_tool):
        self.supabase = supabase_tool
    
    def bootstrap_price_ranges(self, apply: bool = False, limit: Optional[int] = None) -> Dict[str, Any]:
        """Bootstrap price ranges from recent invoice line items"""
        
        self.supabase.log_event(None, None, 'seed_price_bands', {
            'apply': apply,
            'limit': limit,
            'lookback_days': 180
        })
        
        results = {
            'processed': 0,
            'created': 0,
            'updated': 0,
            'skipped': 0,
            'proposals': 0,
            'errors': 0
        }
        
        try:
            # Get historical price data (last 180 days)
            cutoff_date = (datetime.now() - timedelta(days=180)).isoformat()
            
            price_data = self.supabase.client.table('invoice_line_items')\
                .select('canonical_item_id, unit_price')\
                .gte('created_at', cutoff_date)\
                .not_.is_('canonical_item_id', 'null')\
                .not_.is_('unit_price', 'null')\
                .execute()
            
            if not price_data.data:
                return {
                    **results,
                    'error_message': 'No historical price data found'
                }
            
            # Group prices by canonical item
            item_prices = defaultdict(list)
            for row in price_data.data:
                canonical_id = row['canonical_item_id']
                unit_price = float(row['unit_price'])
                if unit_price > 0:  # Exclude zero/negative prices
                    item_prices[canonical_id].append(unit_price)
            
            print(f"  Found price data for {len(item_prices)} canonical items")
            
            # Process each item with sufficient data
            for canonical_id, prices in item_prices.items():
                if limit and results['processed'] >= limit:
                    break
                
                # Need at least 3 price points for robust statistics
                if len(prices) < 3:
                    results['skipped'] += 1
                    continue
                
                try:
                    action = self._create_price_range(canonical_id, prices, apply)
                    if action == 'created':
                        results['created'] += 1
                    elif action == 'updated':
                        results['updated'] += 1
                    elif action == 'proposal':
                        results['proposals'] += 1
                    elif action == 'skipped':
                        results['skipped'] += 1
                    
                    results['processed'] += 1
                    
                except Exception as e:
                    print(f"  Error processing {canonical_id}: {e}")
                    results['errors'] += 1
        
        except Exception as e:
            results['errors'] += 1
            results['error_message'] = str(e)
        
        return results
    
    def _create_price_range(self, canonical_id: str, prices: List[float], apply: bool) -> str:
        """Create price range for a canonical item"""
        
        # Calculate robust statistics
        if HAS_NUMPY:
            prices_array = np.array(prices)
            p5 = np.percentile(prices_array, 5)
            p50 = np.percentile(prices_array, 50)
            p95 = np.percentile(prices_array, 95)
        else:
            # Fallback using Python statistics module
            sorted_prices = sorted(prices)
            n = len(sorted_prices)
            p5_idx = max(0, int(n * 0.05) - 1)
            p50_idx = int(n * 0.5)
            p95_idx = min(n - 1, int(n * 0.95))
            
            p5 = sorted_prices[p5_idx]
            p50 = statistics.median(prices)
            p95 = sorted_prices[p95_idx]
        
        # Use p5-p95 range with some padding for robustness
        min_price = max(0.01, p5 * 0.9)  # 10% buffer below p5
        max_price = p95 * 1.1  # 10% buffer above p95
        
        # Check if price range already exists
        existing = self.supabase.client.table('item_price_ranges')\
            .select('id, min_price, max_price')\
            .eq('canonical_item_id', canonical_id)\
            .execute()
        
        range_data = {
            'canonical_item_id': canonical_id,
            'min_price': min_price,
            'max_price': max_price,
            'p50_price': p50,  # If table supports it
            'sample_size': len(prices),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        if existing.data:
            # Range exists - check if significant change needed
            existing_range = existing.data[0]
            existing_min = float(existing_range['min_price'])
            existing_max = float(existing_range['max_price'])
            
            # Check if new range differs significantly (>20% change)
            min_change = abs(min_price - existing_min) / existing_min
            max_change = abs(max_price - existing_max) / existing_max
            
            if min_change > 0.2 or max_change > 0.2:
                if apply:
                    # Direct update
                    self.supabase.client.table('item_price_ranges')\
                        .update(range_data)\
                        .eq('id', existing_range['id'])\
                        .execute()
                    return 'updated'
                else:
                    # Create proposal for range adjustment
                    proposal_payload = {
                        'canonical_item_id': canonical_id,
                        'old_range': [existing_min, existing_max],
                        'new_range': [min_price, max_price],
                        'reason': f'Bootstrap from {len(prices)} historical prices',
                        'statistics': {
                            'p5': float(p5),
                            'p50': float(p50),
                            'p95': float(p95),
                            'sample_size': len(prices)
                        }
                    }
                    
                    self.supabase.create_proposal('PRICE_RANGE_ADJUST', proposal_payload)
                    return 'proposal'
            else:
                return 'skipped'
        else:
            # No existing range - create new one
            if apply:
                # Direct creation
                range_data['id'] = str(uuid.uuid4())
                range_data['created_at'] = datetime.utcnow().isoformat()
                
                self.supabase.client.table('item_price_ranges')\
                    .insert(range_data)\
                    .execute()
                return 'created'
            else:
                # Create proposal for new range
                proposal_payload = {
                    'canonical_item_id': canonical_id,
                    'new_range': [min_price, max_price],
                    'reason': f'Bootstrap from {len(prices)} historical prices',
                    'statistics': {
                        'p5': float(p5),
                        'p50': float(p50),
                        'p95': float(p95),
                        'sample_size': len(prices)
                    }
                }
                
                self.supabase.create_proposal('PRICE_RANGE_ADJUST', proposal_payload)
                return 'proposal'