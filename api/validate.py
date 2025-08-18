import sys
import os
import logging
from typing import Dict, Any, Optional

# Add parent directory to path to import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, request, jsonify
from material_validator import validate_material

app = Flask(__name__)

# Configure logging for minimal output
logging.basicConfig(level=logging.WARNING)

def normalize_input(material: str) -> str:
    """Normalize material input text."""
    if not material:
        return ""
    return material.strip()

def validate_request_data(data: Dict) -> tuple[bool, str, Dict]:
    """Validate incoming request data and return normalized inputs."""
    if not isinstance(data, dict):
        return False, "Request body must be JSON object", {}
    
    material = data.get('material', '').strip()
    if not material:
        return False, "Field 'material' is required and cannot be empty", {}
    
    unit_price = data.get('unit_price')
    if unit_price is not None:
        try:
            unit_price = float(unit_price)
            if unit_price < 0:
                return False, "Field 'unit_price' must be non-negative", {}
        except (ValueError, TypeError):
            return False, "Field 'unit_price' must be a valid number", {}
    
    quantity = data.get('quantity', 1)
    try:
        quantity = int(quantity)
        if quantity <= 0:
            return False, "Field 'quantity' must be positive integer", {}
    except (ValueError, TypeError):
        return False, "Field 'quantity' must be a valid integer", {}
    
    region = data.get('region', 'US').strip()
    if not region:
        region = 'US'
    
    # Default service line/type for now - can be made configurable
    service_line = data.get('service_line', 'Plumbing')
    service_type = data.get('service_type', 'Repair')
    
    normalized_inputs = {
        'material': normalize_input(material),
        'unit_price': unit_price,
        'quantity': quantity,
        'region': region,
        'service_line': service_line,
        'service_type': service_type
    }
    
    return True, "", normalized_inputs

def map_decision_to_status(decision: str) -> str:
    """Map validator decision to API status."""
    mapping = {
        'allow': 'ALLOW',
        'needs_review': 'NEEDS_REVIEW', 
        'reject': 'REJECT'
    }
    return mapping.get(decision.lower(), 'NEEDS_REVIEW')

def extract_reason_codes(reasons: list, price_info: Dict) -> list:
    """Extract standardized reason codes from validation results."""
    codes = []
    
    for reason in reasons:
        reason_lower = reason.lower()
        if 'not mapped' in reason_lower or 'not recognized' in reason_lower:
            codes.append('NO_MATCH')
        elif 'knowledge base' in reason_lower:
            codes.append('KB_SUPPORT')
        elif 'price far outside' in reason_lower or 'far outside' in reason_lower:
            codes.append('PRICE_HIGH')
        elif 'price slightly outside' in reason_lower or 'slightly outside' in reason_lower:
            codes.append('PRICE_BORDERLINE')
        elif 'price within' in reason_lower:
            codes.append('PRICE_OK')
    
    # Add price-specific codes
    if price_info.get('status') == 'out_of_band':
        codes.append('PRICE_HIGH')
    elif price_info.get('status') == 'borderline':
        codes.append('PRICE_BORDERLINE')
    elif price_info.get('status') == 'in_band':
        codes.append('PRICE_OK')
    elif price_info.get('status') == 'no_cache':
        codes.append('NO_PRICE_DATA')
    
    return list(set(codes)) if codes else ['UNKNOWN']

@app.route('/health', methods=['GET'])
@app.route('/', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"ok": True})

@app.route('/validate', methods=['POST'])
def validate():
    """Main validation endpoint."""
    try:
        # Parse and validate request
        if not request.is_json:
            return jsonify({
                "error": "Content-Type must be application/json"
            }), 400
        
        data = request.get_json()
        is_valid, error_msg, inputs = validate_request_data(data)
        
        if not is_valid:
            return jsonify({"error": error_msg}), 400
        
        # Call our validation pipeline
        result = validate_material(
            service_line=inputs['service_line'],
            service_type=inputs['service_type'],
            material_text=inputs['material'],
            proposed_price=inputs['unit_price'],
            region=inputs['region']
        )
        
        # Extract response data
        status = map_decision_to_status(result['decision'])
        reason_codes = extract_reason_codes(result['reasons'], result['price_check'])
        
        # Build material match info
        material_info = result.get('material', {})
        material_match = {
            "canonical": material_info.get('resolved_material_name'),
            "confidence": round(material_info.get('match_confidence', 0.0), 3)
        }
        
        # Build pricing info
        price_check = result.get('price_check', {})
        pricing = {
            "unit_price": inputs['unit_price'],
            "min": None,
            "max": None,
            "currency": "USD"
        }
        
        # Extract price range from note if available
        note = price_check.get('note', '')
        if 'vs cache $' in note:
            try:
                # Extract range from note like "vs cache $10.50-$25.75"
                import re
                match = re.search(r'\$([0-9.]+)-\$([0-9.]+)', note)
                if match:
                    pricing['min'] = float(match.group(1))
                    pricing['max'] = float(match.group(2))
            except:
                pass
        
        # Build response
        response = {
            "status": status,
            "reason_codes": reason_codes,
            "material_match": material_match,
            "pricing": pricing,
            "inputs": {
                "material": inputs['material'],
                "unit_price": inputs['unit_price'],
                "quantity": inputs['quantity']
            }
        }
        
        return jsonify(response)
        
    except ValueError as e:
        # Handle missing environment variables gracefully
        error_msg = str(e)
        if "must be set" in error_msg:
            return jsonify({
                "error": "Service configuration error"
            }), 500
        return jsonify({"error": "Invalid input data"}), 400
        
    except Exception as e:
        # Log error without exposing sensitive details
        app.logger.error(f"Validation error: {type(e).__name__}")
        return jsonify({
            "error": "Internal server error"
        }), 500

# For Vercel compatibility
def handler(event, context):
    """Vercel handler function."""
    return app(event, context)

if __name__ == '__main__':
    app.run(debug=False)