#!/usr/bin/env python3

import argparse
import json
import sys
from dotenv import load_dotenv
from material_validator import validate_material

def main():
    load_dotenv()
    
    parser = argparse.ArgumentParser(description='Test material validator')
    parser.add_argument('--line', required=True, help='Service line')
    parser.add_argument('--type', required=True, help='Service type')
    parser.add_argument('--material', required=True, help='Material text')
    parser.add_argument('--price', type=float, help='Proposed price')
    parser.add_argument('--region', default='US', help='Region')
    
    args = parser.parse_args()
    
    try:
        result = validate_material(
            service_line=args.line,
            service_type=args.type,
            material_text=args.material,
            proposed_price=args.price,
            region=args.region
        )
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()