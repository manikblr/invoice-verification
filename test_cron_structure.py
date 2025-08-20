#!/usr/bin/env python3
"""
Simple structure test for cron endpoints without external dependencies
"""

import os
import ast
from pathlib import Path

def test_endpoint_structure():
    """Test that cron endpoints have proper structure"""
    
    base_dir = Path(__file__).parent
    results = {
        'files_checked': 0,
        'files_valid': 0,
        'functions_found': 0,
        'errors': []
    }
    
    endpoints = [
        ('api/relearn.py', ['relearn', 'compute_robust_stats_postgres', 'round_price']),
        ('api/safety_scan.py', ['safety_scan', 'infer_canonical_name', 'round_price'])
    ]
    
    for endpoint_file, expected_functions in endpoints:
        file_path = base_dir / endpoint_file
        results['files_checked'] += 1
        
        if file_path.exists():
            try:
                with open(file_path, 'r') as f:
                    content = f.read()
                
                # Parse AST to find functions and classes
                tree = ast.parse(content)
                
                functions = []
                routes = []
                
                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef):
                        functions.append(node.name)
                        results['functions_found'] += 1
                        
                        # Check for Flask route decorator
                        for decorator in node.decorator_list:
                            if isinstance(decorator, ast.Call):
                                if hasattr(decorator.func, 'attr') and decorator.func.attr == 'route':
                                    routes.append(node.name)
                
                # Check for expected functions
                missing_functions = [f for f in expected_functions if f not in functions]
                if missing_functions:
                    results['errors'].append(f"{endpoint_file} - Missing functions: {missing_functions}")
                else:
                    results['files_valid'] += 1
                    print(f"✓ {endpoint_file} - Functions: {', '.join(functions)}")
                    if routes:
                        print(f"  Routes: {', '.join(routes)}")
                
                # Check for proper imports
                if 'Flask' in content and 'SupabaseTool' in content:
                    print(f"  ✓ Proper imports found")
                else:
                    results['errors'].append(f"{endpoint_file} - Missing key imports")
                    
            except Exception as e:
                results['errors'].append(f"{endpoint_file} - Parse error: {e}")
        else:
            results['errors'].append(f"{endpoint_file} - File not found")
    
    # Test vercel.json
    vercel_path = base_dir / 'vercel.json'
    results['files_checked'] += 1
    
    if vercel_path.exists():
        try:
            import json
            with open(vercel_path, 'r') as f:
                config = json.load(f)
            
            if 'crons' in config:
                cron_paths = [cron.get('path') for cron in config['crons']]
                expected_paths = ['/api/relearn', '/api/safety_scan']
                
                if all(path in cron_paths for path in expected_paths):
                    results['files_valid'] += 1
                    print(f"✓ vercel.json - Cron jobs: {cron_paths}")
                else:
                    results['errors'].append(f"vercel.json - Missing cron paths: {expected_paths}")
            else:
                results['errors'].append("vercel.json - No crons section found")
                
        except Exception as e:
            results['errors'].append(f"vercel.json - JSON error: {e}")
    else:
        results['errors'].append("vercel.json - File not found")
    
    # Print summary
    print(f"\n=== CRON ENDPOINTS STRUCTURE TEST ===")
    print(f"Files checked: {results['files_checked']}")
    print(f"Files valid: {results['files_valid']}")
    print(f"Functions found: {results['functions_found']}")
    print(f"Success rate: {results['files_valid']}/{results['files_checked']} ({100 * results['files_valid'] / results['files_checked']:.1f}%)")
    
    if results['errors']:
        print(f"\nErrors found:")
        for error in results['errors']:
            print(f"  ✗ {error}")
    else:
        print(f"\n🎉 All cron endpoint files are structurally valid!")
    
    return results

if __name__ == '__main__':
    test_endpoint_structure()