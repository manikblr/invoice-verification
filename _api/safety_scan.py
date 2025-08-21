"""
Nightly safety scan endpoint - detects and proposes fixes for data integrity issues
"""

import os
from datetime import datetime, timedelta
from flask import Flask, jsonify
from typing import Dict, Any, List, Optional

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

def infer_canonical_name(synonym: str) -> str:
    """Infer a canonical name from a synonym (basic cleanup)"""
    # Basic cleanup: title case, remove extra spaces
    name = ' '.join(synonym.strip().split())
    return name.title()

@app.route('/api/safety_scan', methods=['GET']) 
def safety_scan():
    """
    Nightly safety scan: detect data integrity issues and propose fixes
    """
    
    try:
        # Initialize Supabase tool
        supabase_tool = SupabaseTool()
        
        # Time window for stats: last 90 days
        cutoff_date = (datetime.utcnow() - timedelta(days=90)).isoformat()
        
        # Log scan start
        supabase_tool.log_event(None, None, 'safety_scan_start', {
            'cutoff_date': cutoff_date
        })
        
        results = {
            'issues': {
                'bands_fixed': 0,
                'bands_missing': 0, 
                'orphans': 0,
                'conflicts': 0
            },
            'warnings': 0,
            'errors': 0
        }
        
        # 1. Check for band anomalies (min > max, or min = 0 with usage)
        print("Checking for price band anomalies...")
        
        anomalous_bands = supabase_tool.client.table('item_price_ranges')\
            .select('id, canonical_item_id, min_price, max_price')\
            .execute()
        
        for band in anomalous_bands.data if anomalous_bands.data else []:
            canonical_id = band['canonical_item_id']
            min_price = float(band['min_price'])
            max_price = float(band['max_price'])
            
            needs_fix = False
            fix_reason = ""
            
            # Check min > max
            if min_price >= max_price:
                needs_fix = True
                fix_reason = f"Invalid range: min ({min_price}) >= max ({max_price})"
            
            # Check min = 0 with recent usage  
            elif min_price == 0:
                usage_check = supabase_tool.client.table('invoice_line_items')\
                    .select('id')\
                    .eq('canonical_item_id', canonical_id)\
                    .gte('created_at', cutoff_date)\
                    .limit(1)\
                    .execute()
                
                if usage_check.data:
                    needs_fix = True
                    fix_reason = "Zero min_price with recent usage"
            
            if needs_fix:
                # Get robust p5 from recent data to suggest fix
                try:
                    recent_prices = supabase_tool.client.table('invoice_line_items')\
                        .select('unit_price')\
                        .eq('canonical_item_id', canonical_id)\
                        .gte('created_at', cutoff_date)\
                        .gt('unit_price', 0)\
                        .execute()
                    
                    suggested_min = 0.01
                    suggested_max = max_price if max_price > 0 else 100.0
                    
                    if recent_prices.data and len(recent_prices.data) >= 3:
                        prices = sorted([float(row['unit_price']) for row in recent_prices.data])
                        n = len(prices)
                        p5_idx = max(0, int(n * 0.05) - 1)
                        p95_idx = min(n - 1, int(n * 0.95))
                        
                        suggested_min = round_price(prices[p5_idx])
                        if min_price >= max_price:
                            suggested_max = round_price(prices[p95_idx])
                    
                    # Create fix proposal
                    proposal_payload = {
                        'canonical_item_id': canonical_id,
                        'band_id': band['id'],
                        'issue': fix_reason,
                        'current_range': [min_price, max_price],
                        'suggested_range': [suggested_min, suggested_max],
                        'auto_generated': True
                    }
                    
                    supabase_tool.create_proposal('PRICE_RANGE_ADJUST', proposal_payload)
                    results['issues']['bands_fixed'] += 1
                    
                except Exception as e:
                    print(f"Error creating band fix proposal for {canonical_id}: {e}")
                    results['errors'] += 1
        
        # 2. Check for missing bands on high-usage canonicals
        print("Checking for missing price bands...")
        
        # Get canonicals with usage >= 20 in recent period
        high_usage = supabase_tool.client.table('invoice_line_items')\
            .select('canonical_item_id')\
            .gte('created_at', cutoff_date)\
            .not_.is_('canonical_item_id', 'null')\
            .execute()
        
        if high_usage.data:
            usage_counts = {}
            for row in high_usage.data:
                canonical_id = row['canonical_item_id']
                usage_counts[canonical_id] = usage_counts.get(canonical_id, 0) + 1
            
            for canonical_id, count in usage_counts.items():
                if count >= 20:
                    # Check if band exists
                    existing_band = supabase_tool.client.table('item_price_ranges')\
                        .select('id')\
                        .eq('canonical_item_id', canonical_id)\
                        .execute()
                    
                    if not existing_band.data:
                        # Missing band - compute suggested range
                        try:
                            prices_result = supabase_tool.client.table('invoice_line_items')\
                                .select('unit_price')\
                                .eq('canonical_item_id', canonical_id)\
                                .gte('created_at', cutoff_date)\
                                .gt('unit_price', 0)\
                                .execute()
                            
                            if prices_result.data and len(prices_result.data) >= 5:
                                prices = sorted([float(row['unit_price']) for row in prices_result.data])
                                n = len(prices)
                                
                                p5_idx = max(0, int(n * 0.05) - 1)
                                p50_idx = int(n * 0.5)
                                p95_idx = min(n - 1, int(n * 0.95))
                                
                                suggested_min = round_price(prices[p5_idx])
                                suggested_p50 = round_price(prices[p50_idx])
                                suggested_max = round_price(prices[p95_idx])
                                
                                proposal_payload = {
                                    'canonical_item_id': canonical_id,
                                    'usage_count': count,
                                    'suggested_range': [suggested_min, suggested_max],
                                    'p50': suggested_p50,
                                    'reason': f'Missing band for high-usage item ({count} recent uses)',
                                    'auto_generated': True
                                }
                                
                                supabase_tool.create_proposal('PRICE_RANGE_ADJUST', proposal_payload)
                                results['issues']['bands_missing'] += 1
                                
                        except Exception as e:
                            print(f"Error creating missing band proposal for {canonical_id}: {e}")
                            results['errors'] += 1
        
        # 3. Check for orphan synonyms
        print("Checking for orphan synonyms...")
        
        synonyms = supabase_tool.client.table('item_synonyms')\
            .select('id, canonical_item_id, synonym, confidence')\
            .execute()
        
        if synonyms.data:
            for synonym_row in synonyms.data:
                canonical_id = synonym_row['canonical_item_id']
                
                # Check if canonical exists
                canonical_exists = supabase_tool.client.table('canonical_items')\
                    .select('id')\
                    .eq('id', canonical_id)\
                    .execute()
                
                if not canonical_exists.data:
                    # Orphan synonym
                    synonym_text = synonym_row['synonym']
                    confidence = float(synonym_row.get('confidence', 0))
                    
                    if confidence >= 0.8:
                        # High confidence - propose new canonical
                        inferred_name = infer_canonical_name(synonym_text)
                        
                        proposal_payload = {
                            'orphan_synonym_id': synonym_row['id'],
                            'synonym_text': synonym_text, 
                            'confidence': confidence,
                            'inferred_canonical_name': inferred_name,
                            'reason': f'Orphan synonym with high confidence ({confidence})',
                            'auto_generated': True
                        }
                        
                        supabase_tool.create_proposal('NEW_CANONICAL', proposal_payload)
                        results['issues']['orphans'] += 1
                    else:
                        # Low confidence - just log warning
                        supabase_tool.log_event(None, None, 'orphan_synonym_warn', {
                            'synonym_id': synonym_row['id'],
                            'synonym_text': synonym_text,
                            'confidence': confidence,
                            'reason': 'Low confidence orphan'
                        })
                        results['warnings'] += 1
        
        # 4. Check for conflicting rules (same scope, contradictory decisions)
        print("Checking for conflicting rules...")
        
        rules = supabase_tool.client.table('agent_rules')\
            .select('id, scope_type, scope_value, decision, policy_codes')\
            .execute()
        
        if rules.data:
            # Group by scope
            scope_rules = {}
            for rule in rules.data:
                scope_key = f"{rule['scope_type']}:{rule['scope_value']}"
                if scope_key not in scope_rules:
                    scope_rules[scope_key] = []
                scope_rules[scope_key].append(rule)
            
            # Check for conflicts within each scope
            for scope_key, scope_rule_list in scope_rules.items():
                if len(scope_rule_list) > 1:
                    # Check for contradictory decisions
                    decisions = set(rule['decision'] for rule in scope_rule_list)
                    
                    if len(decisions) > 1 and ('ALLOW' in decisions and 'DENY' in decisions):
                        # Conflict detected
                        proposal_payload = {
                            'scope_key': scope_key,
                            'conflicting_rules': [
                                {
                                    'id': rule['id'],
                                    'decision': rule['decision'],
                                    'policy_codes': rule['policy_codes']
                                }
                                for rule in scope_rule_list
                            ],
                            'reason': f'Contradictory ALLOW/DENY rules for scope {scope_key}',
                            'suggested_resolution': 'Consolidate with priority order',
                            'auto_generated': True
                        }
                        
                        supabase_tool.create_proposal('NEW_RULE', proposal_payload)
                        results['issues']['conflicts'] += 1
        
        # Log completion
        supabase_tool.log_event(None, None, 'safety_scan_complete', results)
        
        return jsonify({
            'ok': True,
            'message': f'Safety scan complete',
            **results
        })
        
    except Exception as e:
        print(f"Safety scan failed: {e}")
        return jsonify({
            'ok': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True)