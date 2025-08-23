/**
 * Server-side metadata helper - no HTTP fetch required
 * Use this for layouts/server components instead of /api/meta
 */

interface AppMeta {
  name: string
  env: string
  version: string
  cron_enabled: boolean
}

export function getAppMeta(): AppMeta {
  return {
    name: "Invoice Verification",
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || "dev",
    version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || "dev",
    cron_enabled: (process.env.CRON_ENABLED || 'false').toLowerCase() === 'true'
  }
}