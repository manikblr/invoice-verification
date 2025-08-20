/**
 * Nightly re-learning endpoint - updates price bands from recent invoice data
 * Scheduled to run at 03:00 IST (21:30 UTC) via Vercel cron
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertCronEnabled } from '@/server/cron';
import { errorResponse } from '@/server/http';

interface RelearnResponse {
  ok: boolean;
  message: string;
  scanned: number;
  proposed: number;
  skipped: number;
  errors: number;
}

/**
 * GET /api/relearn
 * 
 * Scans recent invoice data (90 days) and proposes price band updates
 * when significant changes are detected (>5% delta).
 * 
 * Environment controls:
 * - CRON_ENABLED=false: Returns 503 immediately
 * - AGENT_DRY_RUN=true: Only creates proposals (default)
 * - ALLOW_AUTO_PRICE_ADJUST=false: Never auto-applies changes (default)
 */
export async function GET(request: NextRequest): Promise<NextResponse<RelearnResponse | any>> {
  try {
    // Global cron kill-switch check
    assertCronEnabled();
    
    console.log('Relearn job started at', new Date().toISOString());
    
    // TODO: Implement the actual re-learning logic
    // This would typically involve:
    // 1. Querying invoice_line_items for last 90 days
    // 2. Computing p5/p50/p95 percentiles per canonical_item_id  
    // 3. Comparing against existing item_price_ranges
    // 4. Creating PRICE_RANGE_ADJUST proposals for significant changes
    
    // For now, return mock response structure
    const results: RelearnResponse = {
      ok: true,
      message: 'Relearn complete: scanned 0 items (not implemented)',
      scanned: 0,
      proposed: 0,
      skipped: 0,
      errors: 0
    };
    
    console.log('Relearn job completed:', results);
    
    return NextResponse.json(results);
    
  } catch (error) {
    console.error('Relearn job failed:', error);
    return errorResponse(error);
  }
}