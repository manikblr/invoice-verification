#!/usr/bin/env python3
"""
Simple Flask server to provide CrewAI agent functionality for the enhanced validation API
"""

import os
import sys
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import traceback
from agents.crew_runner import CrewRunner

app = Flask(__name__)
CORS(app)

# Initialize the crew runner
crew_runner = CrewRunner()

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    try:
        health_check = crew_runner.health_check()
        return jsonify({
            'status': 'healthy',
            'crew_runner': health_check
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 500

@app.route('/api/agent_run_crew', methods=['POST'])
def run_agent_crew():
    """Main endpoint for running the CrewAI agent pipeline"""
    try:
        # Parse request
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
            
        # Extract required fields
        invoice_id = data.get('invoice_id')
        vendor_id = data.get('vendor_id') 
        items = data.get('items', [])
        
        if not invoice_id or not vendor_id:
            return jsonify({'error': 'Missing invoice_id or vendor_id'}), 400
            
        if not items:
            return jsonify({'error': 'No items provided'}), 400
            
        print(f"Processing invoice {invoice_id} with {len(items)} items for vendor {vendor_id}")
        
        # Run the crew
        result = crew_runner.run_crew(invoice_id, vendor_id, items)
        
        # Transform result to match expected API format
        decisions = []
        for item_id, decision_data in result.get('decisions', {}).items():
            
            # Extract price band if available
            price_band = None
            if 'judgement' in decision_data:
                judgement = decision_data['judgement']
                if 'price_band' in judgement:
                    pb = judgement['price_band']
                    if isinstance(pb, dict) and 'min_price' in pb and 'max_price' in pb:
                        price_band = {'min': pb['min_price'], 'max': pb['max_price']}
            
            decisions.append({
                'lineId': item_id,
                'policy': decision_data.get('decision', 'NEEDS_MORE_INFO'),
                'reasons': decision_data.get('reasons', []),
                'canonicalItemId': decision_data.get('canonical_item_id'),
                'priceBand': price_band,
                'judge': decision_data.get('judgement', {})
            })
        
        response = {
            'invoiceId': invoice_id,
            'decisions': decisions,
            'runTraceId': f"trace_{invoice_id}",
            'summary': result.get('pipeline_stats', {}),
            'evaluation': result.get('evaluation')
        }
        
        print(f"Successfully processed {len(decisions)} items")
        return jsonify(response), 200
        
    except Exception as e:
        print(f"Error processing request: {str(e)}")
        print(traceback.format_exc())
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500

@app.route('/', methods=['GET'])
def index():
    """Root endpoint"""
    return jsonify({
        'service': 'CrewAI Agent Server',
        'status': 'running',
        'endpoints': [
            '/health',
            '/api/agent_run_crew'
        ]
    })

if __name__ == '__main__':
    # Set environment variables for development
    os.environ.setdefault('AGENT_ENABLED', 'true')
    os.environ.setdefault('AGENT_DRY_RUN', 'false')
    
    print("Starting CrewAI Agent Server...")
    print(f"Agent enabled: {os.getenv('AGENT_ENABLED')}")
    print(f"Dry run mode: {os.getenv('AGENT_DRY_RUN')}")
    
    # Run the Flask server
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'true').lower() == 'true'
    
    app.run(host='0.0.0.0', port=port, debug=debug)