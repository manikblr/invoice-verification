import { NextResponse } from 'next/server'
import { getAppMeta } from '@/lib/meta'

export async function GET() {
  return NextResponse.json(getAppMeta())
}