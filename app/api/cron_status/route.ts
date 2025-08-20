/**
 * Cron status endpoint for deployment verification
 * Returns current cron job configuration status
 */

import { NextResponse } from 'next/server';
import { env } from '@/config/env';

/**
 * GET /api/cron_status
 * 
 * Returns the current cron job enablement status
 * - Used for deployment verification and ops monitoring
 * - Safe to call without authentication
 * - Reflects current CRON_ENABLED environment variable
 */
export async function GET(): Promise<NextResponse> {
  const cronStatus = {
    cron_enabled: env.CRON_ENABLED === true
  };

  return NextResponse.json(cronStatus);
}