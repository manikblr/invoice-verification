/**
 * Cron job utilities and guards
 * Provides centralized control over cron execution
 */

import { env } from '@/config/env';

/**
 * Custom error class for disabled cron jobs
 * Provides machine-readable error code for API responses
 */
export class CronDisabledError extends Error {
  readonly code = 'CRON_DISABLED';
  
  constructor(message = 'Cron jobs are currently disabled') {
    super(message);
    this.name = 'CronDisabledError';
  }
}

/**
 * Assert that cron jobs are enabled
 * Throws CronDisabledError if CRON_ENABLED=false
 * 
 * Call this at the top of every cron endpoint handler
 * to implement the global kill-switch behavior.
 * 
 * @throws {CronDisabledError} When CRON_ENABLED=false
 * 
 * @example
 * ```ts
 * export async function GET() {
 *   assertCronEnabled(); // Throws if disabled
 *   // ... rest of cron logic
 * }
 * ```
 */
export function assertCronEnabled(): void {
  if (!env.CRON_ENABLED) {
    throw new CronDisabledError(
      'Cron jobs are paused. Set CRON_ENABLED=true to enable.'
    );
  }
}

/**
 * Check if cron jobs are enabled without throwing
 * Useful for conditional logic or logging
 * 
 * @returns {boolean} True if CRON_ENABLED=true
 */
export function isCronEnabled(): boolean {
  return env.CRON_ENABLED;
}