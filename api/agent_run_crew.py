import os
import json
from flask import Flask, request, jsonify
from typing import Dict, Any, List
from pydantic import BaseModel, ValidationError
from agents.crew_runner import CrewRunner
from obs.langfuse_client import start_trace, get_trace_id

app = Flask(__name__)

# Pydantic models for request validation
class LineItemRequest(BaseModel):
    id: str
    description: str
    quantity: int
    unit_price: float

class CrewRunRequest(BaseModel):
    invoice_id: str
    vendor_id: str
    items: List[LineItemRequest]

# Initialize crew runner
crew_runner = CrewRunner()

@app.route('/api/agent_run_crew', methods=['POST'])
def agent_run_crew():
    """
    Flask POST endpoint for running CrewAI pipeline on invoice line items
    
    Input: {invoice_id, vendor_id, items:[{id,description,quantity,unit_price}]}
    Output: {invoice_id, decisions: {<line_item_id>: {...}}, trace_id}
    """
    
    trace = None
    
    try:
        # Validate request data
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        request_data = request.get_json()
        
        # Validate with Pydantic
        try:
            validated_request = CrewRunRequest(**request_data)
        except ValidationError as e:
            return jsonify({
                'error': 'Invalid request format',
                'details': e.errors()
            }), 400
        
        # Start Langfuse trace
        user_id = request.headers.get('X-User')
        trace_metadata = {
            'invoice_id': validated_request.invoice_id,
            'vendor_id': validated_request.vendor_id,
            'item_count': len(validated_request.items)
        }
        
        trace = start_trace(
            operation="agent_run_crew",
            user_id=user_id,
            metadata=trace_metadata
        )
        
        # Convert to dict format expected by crew runner
        items = [
            {
                'id': item.id,
                'description': item.description,
                'quantity': item.quantity,
                'unit_price': item.unit_price
            }
            for item in validated_request.items
        ]
        
        # Run the crew pipeline with trace
        result = crew_runner.run_crew(
            invoice_id=validated_request.invoice_id,
            vendor_id=validated_request.vendor_id,
            items=items,
            trace=trace
        )
        
        # Add trace_id to response
        trace_id = get_trace_id(trace)
        if trace_id:
            result['trace_id'] = trace_id
        
        # Return successful response
        return jsonify(result), 200
        
    except Exception as e:
        # Log error (in production, use proper logging)
        error_msg = f"Internal error processing crew request: {str(e)}"
        print(error_msg)  # Replace with proper logging
        
        response = {
            'error': 'Internal server error',
            'invoice_id': request_data.get('invoice_id') if 'request_data' in locals() else None
        }
        
        # Add trace_id even for errors
        trace_id = get_trace_id(trace)
        if trace_id:
            response['trace_id'] = trace_id
        
        return jsonify(response), 500

@app.route('/api/agent_run_crew/health', methods=['GET'])
def health_check():
    """Health check endpoint for the agent crew service"""
    try:
        health_status = crew_runner.health_check()
        return jsonify({
            'status': 'healthy',
            'service': 'agent_run_crew',
            **health_status
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'service': 'agent_run_crew',
            'error': str(e)
        }), 500

@app.route('/api/agent_run_crew/stats', methods=['GET'])
def get_stats():
    """Get current service statistics"""
    try:
        tools = crew_runner.agent_creator.get_tools_direct()
        
        stats = {
            'service': 'agent_run_crew',
            'enabled': crew_runner.enabled,
            'dry_run': crew_runner.dry_run,
            'matching_stats': tools['matching'].get_match_stats(),
            'pricing_stats': tools['pricing'].get_price_stats(),
            'rules_stats': tools['rules'].get_rule_stats()
        }
        
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({
            'error': 'Failed to get stats',
            'details': str(e)
        }), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({'error': 'Method not allowed'}), 405

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # For local development only
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)