#!/usr/bin/env python3
"""
Orchestrates all seeding tasks for the invoice verification system.
Idempotent and safe to re-run.
"""

import os
import sys
import argparse
from typing import Optional
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.seed.canonical_seed import CanonicalSeeder
from scripts.seed.synonym_seed import SynonymSeeder
from scripts.seed.vendor_catalog_loader import VendorCatalogLoader
from scripts.seed.price_band_bootstrap import PriceBandBootstrapper
from agents.tools.supabase_tool import SupabaseTool


class SeedRunner:
    """Orchestrates all seeding tasks"""
    
    def __init__(self):
        self.supabase = SupabaseTool()
        self.dry_run = os.getenv('AGENT_DRY_RUN', 'true').lower() == 'true'
    
    def run_all_seeds(self, apply: bool = False, limit: Optional[int] = None, 
                     vendor_id: Optional[str] = None) -> dict:
        """Run all seeding tasks"""
        
        # Determine if we should apply changes
        should_apply = apply and not self.dry_run
        mode = "APPLY" if should_apply else "DRY_RUN"
        
        print(f"=== Invoice Verification Seeding ({mode}) ===")
        print(f"AGENT_DRY_RUN: {self.dry_run}")
        print(f"Apply flag: {apply}")
        print(f"Limit: {limit}")
        print(f"Vendor filter: {vendor_id}")
        print()
        
        results = {}
        total_operations = 0
        
        try:
            # 1. Seed canonical items
            print("1. Seeding canonical items...")
            canonical_seeder = CanonicalSeeder(self.supabase)
            canonical_result = canonical_seeder.seed_canonical_items(
                apply=should_apply, 
                limit=limit
            )
            results['canonical'] = canonical_result
            total_operations += canonical_result.get('processed', 0)
            self._print_result("Canonical items", canonical_result)
            
            # 2. Seed synonyms
            print("\n2. Seeding synonyms...")
            synonym_seeder = SynonymSeeder(self.supabase)
            synonym_result = synonym_seeder.seed_synonyms(
                apply=should_apply,
                limit=limit
            )
            results['synonyms'] = synonym_result
            total_operations += synonym_result.get('processed', 0)
            self._print_result("Synonyms", synonym_result)
            
            # 3. Load vendor catalogs
            print("\n3. Loading vendor catalogs...")
            catalog_loader = VendorCatalogLoader(self.supabase)
            catalog_result = catalog_loader.load_all_catalogs(
                apply=should_apply,
                limit=limit,
                vendor_filter=vendor_id
            )
            results['vendor_catalogs'] = catalog_result
            total_operations += catalog_result.get('processed', 0)
            self._print_result("Vendor catalogs", catalog_result)
            
            # 4. Bootstrap price bands
            print("\n4. Bootstrapping price bands...")
            price_bootstrapper = PriceBandBootstrapper(self.supabase)
            price_result = price_bootstrapper.bootstrap_price_ranges(
                apply=should_apply,
                limit=limit
            )
            results['price_bands'] = price_result
            total_operations += price_result.get('processed', 0)
            self._print_result("Price bands", price_result)
            
            # Summary
            print(f"\n=== Summary ({mode}) ===")
            print(f"Total operations: {total_operations}")
            for task, result in results.items():
                errors = result.get('errors', 0)
                status = "✓" if errors == 0 else f"✗ ({errors} errors)"
                print(f"{task}: {result.get('processed', 0)} processed {status}")
            
            return results
            
        except Exception as e:
            print(f"Fatal error during seeding: {e}")
            return {'error': str(e)}
    
    def _print_result(self, task_name: str, result: dict):
        """Print task result summary"""
        processed = result.get('processed', 0)
        created = result.get('created', 0)
        updated = result.get('updated', 0)
        skipped = result.get('skipped', 0)
        errors = result.get('errors', 0)
        proposals = result.get('proposals', 0)
        
        print(f"  {task_name}: {processed} processed")
        if created > 0:
            print(f"    Created: {created}")
        if updated > 0:
            print(f"    Updated: {updated}")
        if skipped > 0:
            print(f"    Skipped: {skipped}")
        if proposals > 0:
            print(f"    Proposals: {proposals}")
        if errors > 0:
            print(f"    Errors: {errors}")


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description='Seed invoice verification data (idempotent & safe)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/seed/run_all.py --dry-run
  python scripts/seed/run_all.py --apply --limit 1000
  python scripts/seed/run_all.py --apply --vendor ACME_CORP
        """.strip()
    )
    
    parser.add_argument(
        '--dry-run', 
        action='store_true',
        default=True,
        help='Dry run mode (default, respects AGENT_DRY_RUN env)'
    )
    
    parser.add_argument(
        '--apply',
        action='store_true', 
        help='Apply changes (overrides --dry-run if AGENT_DRY_RUN=false)'
    )
    
    parser.add_argument(
        '--limit',
        type=int,
        help='Limit number of records to process per task'
    )
    
    parser.add_argument(
        '--vendor',
        help='Filter to specific vendor_id for catalog loading'
    )
    
    args = parser.parse_args()
    
    # Create seed runner and execute
    runner = SeedRunner()
    results = runner.run_all_seeds(
        apply=args.apply,
        limit=args.limit, 
        vendor_id=args.vendor
    )
    
    # Exit with error code if any task failed
    if 'error' in results:
        print(f"\nFATAL: {results['error']}")
        sys.exit(1)
    
    total_errors = sum(result.get('errors', 0) for result in results.values())
    if total_errors > 0:
        print(f"\nCompleted with {total_errors} errors")
        sys.exit(1)
    
    print(f"\nSeeding completed successfully!")
    sys.exit(0)


if __name__ == '__main__':
    main()