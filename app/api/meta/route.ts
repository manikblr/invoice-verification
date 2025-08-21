import { NextResponse } from 'next/server'
import { env } from '@/config/env'

export async function GET() {
  try {
    return NextResponse.json({
      name: "Invoice Verification",
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || "dev",
      version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || "dev",
      cron_enabled: env.CRON_ENABLED === true
    })
  } catch (error) {
    // Fallback if env import fails
    return NextResponse.json({
      name: "Invoice Verification",
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || "dev", 
      version: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
      cron_enabled: false
    })
  }
}