"""
Nightly re-learning endpoint - updates price bands from recent invoice data
"""

import os
from datetime import datetime, timedelta
from flask import Flask, jsonify
from typing import Dict, Any, List, Tuple, Optional

# Import our tools
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from agents.tools.supabase_tool import SupabaseTool

app = Flask(__name__)

def round_price(price: float) -> float:
    """Round price to 2 decimals and clamp to sensible range"""
    if price <= 0:
        return 0.01
    if price > 999999.99:
        return 999999.99
    return round(price, 2)

def compute_robust_stats_postgres(supabase_tool, canonical_item_id: str, cutoff_date: str) -> Optional[Tuple[float, float, float, int]]:
    """Compute p5, p50, p95 using Postgres percentile_disc function"""
    try:
        # Use raw SQL for percentile computation
        query = f"""
        WITH price_data AS (
            SELECT unit_price 
            FROM invoice_line_items 
            WHERE canonical_item_id = '{canonical_item_id}' 
            AND created_at >= '{cutoff_date}'
            AND unit_price > 0
        )
        SELECT 
            percentile_disc(0.05) WITHIN GROUP (ORDER BY unit_price) as p5,
            percentile_disc(0.50) WITHIN GROUP (ORDER BY unit_price) as p50, 
            percentile_disc(0.95) WITHIN GROUP (ORDER BY unit_price) as p95,
            count(*) as sample_size
        FROM price_data;
        """
        
        result = supabase_tool.client.rpc('execute_sql', {'query': query}).execute()
        
        if result.data and len(result.data) > 0:
            row = result.data[0]
            if row['sample_size'] >= 10:
                return (
                    float(row['p5']) if row['p5'] else 0.01,
                    float(row['p50']) if row['p50'] else 0.01, 
                    float(row['p95']) if row['p95'] else 0.01,
                    int(row['sample_size'])
                )
    except Exception as e:
        print(f"Postgres percentile failed for {canonical_item_id}: {e}")
    
    return None

def compute_robust_stats_python(supabase_tool, canonical_item_id: str, cutoff_date: str) -> Optional[Tuple[float, float, float, int]]:
    """Fallback: compute p5, p50, p95 using Python"""
    try:
        # Get price data for this canonical item
        prices_result = supabase_tool.client.table('invoice_line_items')\
            .select('unit_price')\
            .eq('canonical_item_id', canonical_item_id)\
            .gte('created_at', cutoff_date)\
            .gt('unit_price', 0)\
            .execute()
        
        if not prices_result.data or len(prices_result.data) < 10:
            return None
            
        prices = [float(row['unit_price']) for row in prices_result.data]
        prices.sort()
        n = len(prices)
        
        # Calculate percentiles
        p5_idx = max(0, int(n * 0.05) - 1)
        p50_idx = int(n * 0.5)
        p95_idx = min(n - 1, int(n * 0.95))
        
        return (
            prices[p5_idx],
            prices[p50_idx], 
            prices[p95_idx],
            n
        )
        
    except Exception as e:
        print(f"Python percentile failed for {canonical_item_id}: {e}")
        return None

@app.route('/api/relearn', methods=['GET'])
def relearn():
    """
    Nightly re-learning job: scan recent invoices and propose price band updates
    """
    
    try:
        # Initialize Supabase tool
        supabase_tool = SupabaseTool()
        
        # Check environment flags
        dry_run = os.getenv('AGENT_DRY_RUN', 'true').lower() == 'true'
        allow_auto_adjust = os.getenv('ALLOW_AUTO_PRICE_ADJUST', 'false').lower() == 'true'
        
        # Time window: last 90 days
        cutoff_date = (datetime.utcnow() - timedelta(days=90)).isoformat()
        
        # Log the relearn start
        supabase_tool.log_event(None, None, 'relearn_start', {
            'dry_run': dry_run,
            'allow_auto_adjust': allow_auto_adjust,
            'cutoff_date': cutoff_date
        })
        
        results = {
            'scanned': 0,
            'proposed': 0,
            'skipped': 0,
            'errors': 0
        }
        
        # Get canonical items that have recent usage
        canonical_usage = supabase_tool.client.table('invoice_line_items')\
            .select('canonical_item_id')\
            .gte('created_at', cutoff_date)\
            .not_.is_('canonical_item_id', 'null')\
            .execute()
        
        if not canonical_usage.data:
            return jsonify({
                'ok': True,
                'message': 'No recent invoice data found',
                **results
            })
        
        # Count usage per canonical item
        canonical_counts = {}
        for row in canonical_usage.data:
            canonical_id = row['canonical_item_id']
            canonical_counts[canonical_id] = canonical_counts.get(canonical_id, 0) + 1
        
        # Process each canonical with >= 10 observations
        for canonical_id, count in canonical_counts.items():
            if count < 10:
                results['skipped'] += 1
                continue
                
            results['scanned'] += 1
            
            try:
                # Try Postgres first, fall back to Python
                stats = compute_robust_stats_postgres(supabase_tool, canonical_id, cutoff_date)
                if not stats:
                    stats = compute_robust_stats_python(supabase_tool, canonical_id, cutoff_date)
                
                if not stats:
                    results['skipped'] += 1
                    continue
                    
                p5, p50, p95, sample_size = stats
                
                # Round and clamp prices
                p5 = round_price(p5)
                p50 = round_price(p50)  
                p95 = round_price(p95)
                
                # Check against current price range
                current_range = supabase_tool.client.table('item_price_ranges')\
                    .select('id, min_price, max_price')\
                    .eq('canonical_item_id', canonical_id)\
                    .execute()
                
                should_propose = False
                comparison_data = {
                    'new_p5': p5,
                    'new_p50': p50,
                    'new_p95': p95,
                    'sample_size': sample_size
                }
                
                if current_range.data:
                    # Compare with existing range
                    existing = current_range.data[0]
                    current_min = float(existing['min_price'])
                    current_max = float(existing['max_price'])
                    
                    # Check if outside 5% tolerance
                    min_delta = abs(p5 - current_min) / max(current_min, 0.01)
                    max_delta = abs(p95 - current_max) / max(current_max, 0.01)
                    
                    if min_delta > 0.05 or max_delta > 0.05:
                        should_propose = True
                        comparison_data.update({
                            'current_min': current_min,
                            'current_max': current_max,
                            'min_delta_pct': round(min_delta * 100, 2),
                            'max_delta_pct': round(max_delta * 100, 2)
                        })
                else:
                    # No existing range - always propose
                    should_propose = True
                    comparison_data['reason'] = 'no_existing_range'
                
                if should_propose:
                    # Create proposal (never auto-apply for safety)
                    proposal_payload = {
                        'canonical_item_id': canonical_id,
                        'suggested': {
                            'min': p5,
                            'p50': p50,
                            'max': p95
                        },
                        'reason': f'Robust stats from {sample_size} recent observations',
                        'comparison': comparison_data,
                        'auto_generated': True
                    }
                    
                    supabase_tool.create_proposal('PRICE_RANGE_ADJUST', proposal_payload)
                    results['proposed'] += 1
                else:
                    results['skipped'] += 1
                    
            except Exception as e:
                print(f"Error processing {canonical_id}: {e}")
                results['errors'] += 1
        
        # Log completion
        supabase_tool.log_event(None, None, 'relearn_complete', results)
        
        return jsonify({
            'ok': True,
            'message': f'Relearn complete: scanned {results["scanned"]} items',
            **results
        })
        
    except Exception as e:
        print(f"Relearn job failed: {e}")
        return jsonify({
            'ok': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True)