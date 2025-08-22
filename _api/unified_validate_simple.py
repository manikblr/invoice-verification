#!/usr/bin/env python3
"""
Simplified Unified Invoice Validation API
Handles unified items list and routes to appropriate agents
"""

import os
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, List, Optional

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

def detect_item_kind(item_name: str) -> str:
    """
    Simple item kind detection based on keywords
    """
    
    # Equipment keywords for classification
    equipment_keywords = [
        'tool', 'wrench', 'drill', 'saw', 'hammer', 'meter', 'gauge', 
        'pump', 'compressor', 'generator', 'welder', 'grinder', 'crane',
        'ladder', 'scaffold', 'hoist', 'jack', 'cutter', 'blower', 'vacuum',
        'machine', 'device', 'equipment', 'instrument', 'apparatus'
    ]
    
    # Check if item name contains equipment keywords
    item_lower = item_name.lower()
    is_equipment = any(keyword in item_lower for keyword in equipment_keywords)
    
    return 'equipment' if is_equipment else 'material'

def process_unified_items(items: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Process unified items list and categorize into materials and equipment
    """
    materials = []
    equipment = []
    
    for item in items:
        # Detect kind if not provided
        kind = item.get('kind')
        if not kind:
            kind = detect_item_kind(item.get('name', ''))
        
        # Create clean item without kind for backend processing
        clean_item = {
            'name': item.get('name', ''),
            'quantity': item.get('quantity', 1),
            'unit': item.get('unit', 'pcs'),
            'unit_price': item.get('unit_price', 0)
        }
        
        # Categorize
        if kind == 'equipment':
            equipment.append(clean_item)
        else:
            materials.append(clean_item)
    
    return {
        'materials': materials,
        'equipment': equipment,
        'categorization_summary': {
            'total_items': len(items),
            'materials_count': len(materials),
            'equipment_count': len(equipment)
        }
    }

def validate_unified_invoice(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simplified unified invoice validation
    """
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    }
    
    try:
        # Handle OPTIONS request
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'CORS preflight'})
            }
        
        # Parse request body
        try:
            if isinstance(event.get('body'), str):
                body = json.loads(event['body'])
            else:
                body = event.get('body', {})
        except json.JSONDecodeError:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Invalid JSON in request body'})
            }
        
        validation_start_time = time.time()
        
        # Process unified items if provided
        categorization_summary = {}
        if 'items' in body and body['items']:
            categorized = process_unified_items(body['items'])
            
            # Use categorized items
            body['materials'] = categorized['materials']
            body['equipment'] = categorized['equipment']
            categorization_summary = categorized['categorization_summary']
            
        else:
            # Handle legacy format or empty items
            if 'materials' not in body:
                body['materials'] = []
            if 'equipment' not in body:
                body['equipment'] = []
                
            categorization_summary = {
                'total_items': len(body['materials']) + len(body['equipment']),
                'materials_count': len(body['materials']),
                'equipment_count': len(body['equipment']),
                'legacy_format': True
            }
        
        # Try to import and use crew system
        try:
            from agents.crew_runner import CrewRunner
            
            crew_runner = CrewRunner()
            
            # Prepare items for crew processing
            items_for_crew = []
            
            # Add materials
            for i, material in enumerate(body.get('materials', [])):
                items_for_crew.append({
                    'id': f'material_{i}',
                    'description': material.get('name', ''),
                    'quantity': material.get('quantity', 1),
                    'unit_price': material.get('unit_price', 0)
                })
            
            # Add equipment
            for i, equipment_item in enumerate(body.get('equipment', [])):
                items_for_crew.append({
                    'id': f'equipment_{i}',
                    'description': equipment_item.get('name', ''),
                    'quantity': equipment_item.get('quantity', 1),
                    'unit_price': equipment_item.get('unit_price', 0)
                })
            
            # Generate invoice ID for tracking
            invoice_id = f"unified_{int(time.time())}"
            
            # Run crew validation
            crew_result = crew_runner.run_crew(
                invoice_id=invoice_id,
                vendor_id="unified_interface",
                items=items_for_crew
            )
            
            # Calculate processing time
            total_validation_time = time.time() - validation_start_time
            
            # Prepare enhanced response
            enhanced_result = {
                **crew_result,
                'unified_validation': {
                    'categorization_used': 'items' in body,
                    'categorization_summary': categorization_summary,
                    'validation_time_ms': total_validation_time * 1000,
                    'items_processed': len(items_for_crew)
                }
            }
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(enhanced_result, indent=2)
            }
            
        except ImportError:
            # Fallback when crew system is not available
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'message': 'Unified validation processed',
                    'categorization_summary': categorization_summary,
                    'materials': body.get('materials', []),
                    'equipment': body.get('equipment', []),
                    'note': 'Crew system not available - categorization only'
                })
            }
        
    except Exception as e:
        print(f"Error in unified invoice validation: {e}")
        
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            })
        }

# Handler for Vercel
def handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """Main handler for unified invoice validation"""
    return validate_unified_invoice(event)

# Alternative handler name that Vercel might look for
def main(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """Alternative main handler for unified invoice validation"""
    return validate_unified_invoice(event)

# For local testing
if __name__ == "__main__":
    # Test unified validation
    test_event = {
        'httpMethod': 'POST',
        'body': json.dumps({
            'scope_of_work': 'Test unified validation',
            'service_line_id': 14,
            'service_type_id': 2,
            'labor_hours': 2.0,
            'items': [
                {
                    'name': 'PVC Pipe',
                    'quantity': 10,
                    'unit': 'ft',
                    'unit_price': 2.50
                },
                {
                    'name': 'Pipe Wrench',
                    'quantity': 1,
                    'unit': 'day',
                    'unit_price': 45.00
                }
            ]
        })
    }
    
    response = handler(test_event)
    print(f"Status: {response['statusCode']}")
    
    if response['statusCode'] == 200:
        data = json.loads(response['body'])
        if 'unified_validation' in data:
            print(f"Processed {data['unified_validation']['items_processed']} items")
            print(f"Validation time: {data['unified_validation']['validation_time_ms']:.1f}ms")
            print(f"Categorization: {data['unified_validation']['categorization_summary']}")
        else:
            print("Categorization-only response received")
    else:
        print(f"Error: {response['body']}")