#!/usr/bin/env python3
"""
Test script to validate the seeding system structure without dependencies
"""

import os
import csv
from pathlib import Path

def test_seed_files():
    """Test that all seed files exist and have correct structure"""
    
    base_dir = Path(__file__).parent
    results = {
        'files_checked': 0,
        'files_valid': 0,
        'errors': []
    }
    
    # Test Python modules exist
    seed_modules = [
        'scripts/seed/run_all.py',
        'scripts/seed/canonical_seed.py', 
        'scripts/seed/synonym_seed.py',
        'scripts/seed/vendor_catalog_loader.py',
        'scripts/seed/price_band_bootstrap.py'
    ]
    
    for module in seed_modules:
        file_path = base_dir / module
        results['files_checked'] += 1
        
        if file_path.exists():
            try:
                with open(file_path, 'r') as f:
                    content = f.read()
                    if 'class' in content or 'def ' in content:
                        results['files_valid'] += 1
                        print(f"✓ {module} - Valid Python module")
                    else:
                        results['errors'].append(f"{module} - No class/function definitions found")
            except Exception as e:
                results['errors'].append(f"{module} - Read error: {e}")
        else:
            results['errors'].append(f"{module} - File not found")
    
    # Test CSV data files
    csv_files = [
        'data/canonical_items.csv',
        'data/item_synonyms.csv', 
        'data/vendor_catalogs/acme_corp.csv',
        'data/vendor_catalogs/office_plus.csv'
    ]
    
    for csv_file in csv_files:
        file_path = base_dir / csv_file
        results['files_checked'] += 1
        
        if file_path.exists():
            try:
                with open(file_path, 'r') as f:
                    reader = csv.reader(f)
                    headers = next(reader)
                    row_count = sum(1 for _ in reader)
                    
                    if row_count > 0:
                        results['files_valid'] += 1
                        print(f"✓ {csv_file} - {row_count} rows, headers: {headers}")
                    else:
                        results['errors'].append(f"{csv_file} - No data rows")
                        
            except Exception as e:
                results['errors'].append(f"{csv_file} - CSV error: {e}")
        else:
            results['errors'].append(f"{csv_file} - File not found")
    
    # Print summary
    print(f"\n=== SEED STRUCTURE TEST RESULTS ===")
    print(f"Files checked: {results['files_checked']}")
    print(f"Files valid: {results['files_valid']}")
    print(f"Success rate: {results['files_valid']}/{results['files_checked']} ({100 * results['files_valid'] / results['files_checked']:.1f}%)")
    
    if results['errors']:
        print(f"\nErrors found:")
        for error in results['errors']:
            print(f"  ✗ {error}")
    else:
        print(f"\n🎉 All seed files are structurally valid!")
    
    return results

if __name__ == '__main__':
    test_seed_files()