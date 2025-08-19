import sys
import os
import json
from typing import Dict, Any

# Add parent directory to path to import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/health', methods=['GET'])
@app.route('/', methods=['GET'])
def health():
    """Public health check endpoint for QA testing."""
    return jsonify({"ok": True, "service": "invoice-verification-test", "env": "staging"})

@app.route('/test-validate-invoice', methods=['POST'])
def test_validate_invoice():
    """Public test endpoint for invoice validation without authentication."""
    try:
        from app_core.validate import validate_invoice
        
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json"}), 400
        
        data = request.get_json()
        
        # Basic validation
        required_fields = ['scope_of_work', 'service_line', 'service_type', 'line_items']
        missing_fields = [field for field in required_fields if not data.get(field)]
        if missing_fields:
            return jsonify({"error": f"Missing required fields: {missing_fields}"}), 400
        
        # Call validation
        result = validate_invoice(data)
        
        return jsonify({
            "test_mode": True,
            "result": result
        })
        
    except Exception as e:
        return jsonify({
            "test_mode": True,
            "error": f"Validation error: {str(e)}"
        }), 500

# For Vercel compatibility
def handler(event, context):
    """Vercel handler function."""
    return app(event, context)

if __name__ == '__main__':
    app.run(debug=False)