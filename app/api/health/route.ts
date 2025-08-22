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
    timestamp: new Date().toISOString(),
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || 'dev',
    services: {
      agent_system: {
        enabled: process.env.AGENT_ENABLED === 'true',
        dry_run: process.env.AGENT_DRY_RUN === 'true'
      },
      judge_system: {
        enabled: process.env.JUDGE_ENABLED === 'true',
        llm_enabled: process.env.JUDGE_USE_LLM === 'true'
      },
      langfuse: {
        configured: !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY),
        host: process.env.LANGFUSE_HOST || 'not configured'
      },
      openrouter: {
        configured: !!process.env.OPENROUTER_API_KEY,
        default_model: process.env.OPENROUTER_MODEL || 'not configured',
        judge_model: process.env.OPENROUTER_JUDGE_MODEL || 'not configured',
        fallback_model: process.env.OPENROUTER_FALLBACK_MODEL || 'not configured'
      }
    },
    features: {
      embeddings: process.env.FEATURE_USE_EMBEDDINGS === 'true',
      synonyms: process.env.FLAGS_AUTO_APPLY_SAFE_SYNONYMS === 'true'
    }
  };

  return NextResponse.json(healthData);
}