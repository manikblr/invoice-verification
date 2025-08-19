import sys
import os
import logging
from typing import Dict, Any, Optional

# Add parent directory to path to import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, request, jsonify

# Import validation functions with error handling
try:
    from material_validator import validate_material
    from app_core.validate import validate_invoice
    from app_core.db import get_supabase_client
    IMPORTS_AVAILABLE = True
except Exception as e:
    # Log import error but don't fail immediately
    print(f"Warning: Some imports failed: {e}")
    IMPORTS_AVAILABLE = False

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

def validate_invoice_request_data(data: Dict) -> tuple[bool, str, Dict]:
    """Validate incoming full invoice request data."""
    if not isinstance(data, dict):
        return False, "Request body must be JSON object", {}
    
    # Required fields
    scope_of_work = data.get('scope_of_work', '').strip()
    if not scope_of_work:
        return False, "Field 'scope_of_work' is required", {}
    
    service_line = data.get('service_line', '').strip()
    if not service_line:
        return False, "Field 'service_line' is required", {}
    
    service_type = data.get('service_type', '').strip()
    if not service_type:
        return False, "Field 'service_type' is required", {}
    
    line_items = data.get('line_items', [])
    if not isinstance(line_items, list) or len(line_items) == 0:
        return False, "Field 'line_items' must be a non-empty array", {}
    
    # Optional fields with defaults
    labor_hours = data.get('labor_hours', 0)
    try:
        labor_hours = float(labor_hours)
        if labor_hours < 0:
            return False, "Field 'labor_hours' must be non-negative", {}
    except (ValueError, TypeError):
        return False, "Field 'labor_hours' must be a valid number", {}
    
    currency = data.get('currency', 'INR').strip().upper()
    
    # Validate each line item
    validated_line_items = []
    for i, item in enumerate(line_items):
        if not isinstance(item, dict):
            return False, f"Line item {i+1} must be an object", {}
        
        line_type = item.get('line_type', '').strip().lower()
        if line_type not in ['material', 'equipment', 'labor']:
            return False, f"Line item {i+1}: line_type must be 'material', 'equipment', or 'labor'", {}
        
        raw_name = item.get('raw_name', '').strip()
        if not raw_name:
            return False, f"Line item {i+1}: raw_name is required", {}
        
        unit = item.get('unit', '').strip()
        if not unit:
            return False, f"Line item {i+1}: unit is required", {}
        
        quantity = item.get('quantity', 1)
        try:
            quantity = float(quantity)
            if quantity <= 0:
                return False, f"Line item {i+1}: quantity must be positive", {}
        except (ValueError, TypeError):
            return False, f"Line item {i+1}: quantity must be a valid number", {}
        
        unit_price = item.get('unit_price')
        if unit_price is not None:
            try:
                unit_price = float(unit_price)
                if unit_price < 0:
                    return False, f"Line item {i+1}: unit_price must be non-negative", {}
            except (ValueError, TypeError):
                return False, f"Line item {i+1}: unit_price must be a valid number", {}
        
        validated_line_items.append({
            'line_type': line_type,
            'raw_name': raw_name,
            'unit': unit,
            'quantity': quantity,
            'unit_price': unit_price
        })
    
    normalized_inputs = {
        'scope_of_work': scope_of_work,
        'service_line': service_line,
        'service_type': service_type,
        'labor_hours': labor_hours,
        'currency': currency,
        'line_items': validated_line_items
    }
    
    return True, "", normalized_inputs

def save_invoice_validation(validation_result: Dict) -> Optional[str]:
    """Save invoice validation to database. Returns invoice_validation_id or None."""
    try:
        client = get_supabase_client()
        
        # Get service_line and service_type IDs
        service_line = validation_result.get('service_line')
        service_type = validation_result.get('service_type')
        
        # Look up service line ID
        service_line_result = client.table('service_lines') \
            .select('id') \
            .eq('name', service_line) \
            .limit(1) \
            .execute()
        
        service_line_id = None
        if service_line_result.data:
            service_line_id = service_line_result.data[0]['id']
        
        # Look up service type ID
        service_type_id = None
        if service_line_id:
            service_type_result = client.table('service_types') \
                .select('id') \
                .eq('name', service_type) \
                .eq('service_line_id', service_line_id) \
                .limit(1) \
                .execute()
            
            if service_type_result.data:
                service_type_id = service_type_result.data[0]['id']
        
        # Insert invoice validation header
        invoice_data = {
            'scope_of_work': validation_result.get('scope_of_work'),
            'service_line_id': service_line_id,
            'service_type_id': service_type_id,
            'labor_hours': validation_result.get('labor_hours'),
            'currency': validation_result.get('currency')
        }
        
        invoice_result = client.table('invoice_validations') \
            .insert(invoice_data) \
            .execute()
        
        if not invoice_result.data:
            return None
        
        invoice_id = invoice_result.data[0]['id']
        
        # Insert line items
        line_items = validation_result.get('line_items', [])
        for item in line_items:
            line_item_data = {
                'invoice_validation_id': invoice_id,
                'line_type': item.get('line_type'),
                'raw_name': item.get('raw_name'),
                'canonical_item_id': item.get('canonical_item_id'),
                'unit': item.get('unit'),
                'quantity': item.get('quantity'),
                'unit_price': item.get('unit_price'),
                'position': item.get('position')
            }
            
            client.table('invoice_line_items') \
                .insert(line_item_data) \
                .execute()
        
        return str(invoice_id)
        
    except Exception as e:
        app.logger.error(f"Failed to save invoice validation: {type(e).__name__}")
        return None

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
    if not IMPORTS_AVAILABLE:
        return jsonify({
            "error": "Service temporarily unavailable - imports failed"
        }), 503
    
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

@app.route('/validate-invoice', methods=['POST'])
def validate_invoice_endpoint():
    """Full invoice validation endpoint."""
    if not IMPORTS_AVAILABLE:
        return jsonify({
            "error": "Service temporarily unavailable - imports failed"
        }), 503
    
    try:
        # Parse and validate request
        if not request.is_json:
            return jsonify({
                "error": "Content-Type must be application/json"
            }), 400
        
        data = request.get_json()
        is_valid, error_msg, inputs = validate_invoice_request_data(data)
        
        if not is_valid:
            return jsonify({"error": error_msg}), 400
        
        # Call full invoice validation
        result = validate_invoice(inputs)
        
        # Save to database
        invoice_id = save_invoice_validation(result)
        if invoice_id:
            result['invoice_id'] = invoice_id
        
        return jsonify(result)
        
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
        app.logger.error(f"Invoice validation error: {type(e).__name__}")
        return jsonify({
            "error": "Internal server error"
        }), 500

# For Vercel compatibility
def handler(event, context):
    """Vercel handler function."""
    return app(event, context)

if __name__ == '__main__':
    app.run(debug=False)