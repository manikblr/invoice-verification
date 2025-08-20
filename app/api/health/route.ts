/**
 * Health check endpoint for deployment verification
 * Returns basic system status without exposing sensitive information
 */

import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * 
 * Basic health check endpoint for monitoring and deployment verification
 * - Does not access database or external services
 * - Returns environment and version information
 * - Always returns 200 OK if application is running
 */
export async function GET(): Promise<NextResponse> {
  const healthData = {
    ok: true,
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || 'dev'
  };

  return NextResponse.json(healthData);
}