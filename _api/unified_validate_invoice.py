#!/usr/bin/env python3
"""
Enhanced Unified Invoice Validation API
Handles unified items list and routes to appropriate agents with comprehensive evaluation
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

try:
    from agents.crew_runner import CrewRunner
    from agents.validation_agent import ValidationAgentCreator
    from agents.enhanced_judge_system import (
        start_agent_evaluation, record_performance_metric, judge_agent_output,
        finalize_agent_evaluation, AgentType, MetricType, get_performance_report
    )
    from obs.langfuse_client import start_trace, with_span
    AGENTS_AVAILABLE = True
except ImportError as e:
    print(f"Import error: {e}")
    CrewRunner = None
    ValidationAgentCreator = None
    start_trace = None
    with_span = None
    start_agent_evaluation = None
    record_performance_metric = None
    judge_agent_output = None
    finalize_agent_evaluation = None
    AgentType = None
    MetricType = None
    AGENTS_AVAILABLE = False

def detect_item_kind(item_name: str, item_description: str = "") -> str:
    """
    Intelligent item kind detection using enhanced validation agent
    """
    if not ValidationAgentCreator:
        return 'material'  # Default fallback
    
    try:
        validator = ValidationAgentCreator()
        
        # Use validation agent to determine if item is equipment or material
        validation_result_json = validator.validation_tool._run(
            item_name, 
            item_description, 
            "Determine if this is equipment or material for facility management"
        )
        
        validation_result = json.loads(validation_result_json)
        
        # Equipment keywords for classification
        equipment_keywords = [
            'tool', 'wrench', 'drill', 'saw', 'hammer', 'meter', 'gauge', 
            'pump', 'compressor', 'generator', 'welder', 'grinder', 'crane',
            'ladder', 'scaffold', 'hoist', 'jack', 'cutter', 'blower', 'vacuum'
        ]
        
        # Check if item name contains equipment keywords
        item_lower = item_name.lower()
        is_likely_equipment = any(keyword in item_lower for keyword in equipment_keywords)
        
        # Use validation result and keyword detection
        if is_likely_equipment or 'equipment' in validation_result.get('details', '').lower():
            return 'equipment'
        else:
            return 'material'
            
    except Exception as e:
        print(f"Error in item kind detection: {e}")
        # Fallback to simple keyword detection
        equipment_keywords = ['tool', 'wrench', 'drill', 'saw', 'pump', 'meter']
        if any(keyword in item_name.lower() for keyword in equipment_keywords):
            return 'equipment'
        return 'material'

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
            kind = detect_item_kind(item.get('name', ''), item.get('description', ''))
        
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
    Enhanced unified invoice validation with comprehensive monitoring
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
        
        # Start comprehensive evaluation session
        validation_session_id = f"unified_validation_{int(time.time())}"
        
        # Start Langfuse trace if available
        trace = None
        if start_trace:
            trace = start_trace(
                operation="unified_invoice_validation",
                metadata={
                    "session_id": validation_session_id,
                    "scope_of_work": body.get('scope_of_work', ''),
                    "service_line_id": body.get('service_line_id'),
                    "service_type_id": body.get('service_type_id'),
                    "has_unified_items": 'items' in body,
                    "item_count": len(body.get('items', []))
                }
            )
        
        # Start agent evaluation if available
        if start_agent_evaluation and AgentType:
            start_agent_evaluation(
                validation_session_id,
                AgentType.CREW_ORCHESTRATOR,
                {
                    "validation_type": "unified_invoice",
                    "input_data": body,
                    "trace_id": getattr(trace, 'id', None) if trace else None
                }
            )
        
        validation_start_time = time.time()
        
        # Process unified items
        if 'items' in body and body['items']:
            categorized = process_unified_items(body['items'])
            
            # Use categorized items
            body['materials'] = categorized['materials']
            body['equipment'] = categorized['equipment']
            
        else:
            # Handle legacy format or empty items
            if 'materials' not in body:
                body['materials'] = []
            if 'equipment' not in body:
                body['equipment'] = []
        
        # Record initial metrics if available
        processing_time = time.time() - validation_start_time
        if record_performance_metric and MetricType:
            record_performance_metric(validation_session_id, MetricType.RESPONSE_TIME, processing_time)
            
            total_items = len(body.get('materials', [])) + len(body.get('equipment', []))
            if total_items > 0:
                record_performance_metric(validation_session_id, MetricType.THROUGHPUT, total_items / processing_time)
        
        # Run validation through crew system
        if not CrewRunner:
            return {
                'statusCode': 503,
                'headers': headers,
                'body': json.dumps({
                    'error': 'Validation system not available',
                    'session_id': validation_session_id
                })
            }
        
        with with_span(trace, "crew_validation", 
                      input_data={'invoice_data': body}) as span:
            
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
            invoice_id = f"unified_{validation_session_id}"
            
            # Run crew validation with comprehensive evaluation
            crew_result = crew_runner.run_crew(
                invoice_id=invoice_id,
                vendor_id="unified_interface",
                items=items_for_crew,
                trace=trace
            )
            
            span['output'] = {
                'items_processed': len(items_for_crew),
                'decisions_made': len(crew_result.get('decisions', {})),
                'crew_evaluation_included': 'evaluation' in crew_result
            }
        
        # Final evaluation metrics
        total_validation_time = time.time() - validation_start_time
        record_performance_metric(validation_session_id, MetricType.RESPONSE_TIME, total_validation_time)
        
        # Calculate success rate
        decisions = crew_result.get('decisions', {})
        if decisions:
            successful_decisions = sum(1 for d in decisions.values() if d.get('decision') == 'ALLOW')
            success_rate = successful_decisions / len(decisions)
            record_performance_metric(validation_session_id, MetricType.ACCURACY, success_rate)
        
        # Judge overall validation process
        validation_output = {
            'crew_result': crew_result,
            'processing_metrics': {
                'total_items': total_items,
                'validation_time': total_validation_time,
                'decisions_count': len(decisions)
            },
            'unified_interface_used': True
        }
        
        validation_judge_result = judge_agent_output(validation_session_id, validation_output)
        
        # Finalize evaluation
        final_evaluation = finalize_agent_evaluation(validation_session_id)
        
        # Prepare enhanced response
        enhanced_result = {
            **crew_result,
            'unified_validation': {
                'session_id': validation_session_id,
                'categorization_used': 'items' in body,
                'total_items_processed': total_items,
                'validation_time_ms': total_validation_time * 1000,
                'evaluation': {
                    'overall_score': final_evaluation.overall_score if final_evaluation else 0,
                    'confidence': final_evaluation.confidence if final_evaluation else 0,
                    'judge_score': validation_judge_result.score,
                    'recommendations': validation_judge_result.recommendations
                } if final_evaluation else None
            }
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(enhanced_result, indent=2)
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
        print(f"Processed {data.get('unified_validation', {}).get('total_items_processed', 0)} items")
        print(f"Validation time: {data.get('unified_validation', {}).get('validation_time_ms', 0):.1f}ms")
    else:
        print(f"Error: {response['body']}")