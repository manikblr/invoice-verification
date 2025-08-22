import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const agentType = searchParams.get('agent_type')
    if (!agentType) {
      return NextResponse.json(
        { 
          error: 'Agent type is required',
          valid_types: ['item_matcher', 'price_learner', 'rule_applier', 'validator', 'crew_orchestrator']
        },
        { status: 400 }
      )
    }
    
    // Forward query parameters
    const params = new URLSearchParams()
    searchParams.forEach((value, key) => {
      params.append(key, value)
    })
    
    // Call the Python API for metrics history
    const response = await fetch(`${API_BASE}/_api/performance_report/metrics/history?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('Metrics history API error:', error)
      return NextResponse.json(
        { 
          error: 'Failed to fetch metrics history',
          details: error 
        },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=120', // Cache for 2 minutes
      },
    })
    
  } catch (error) {
    console.error('Error fetching metrics history:', error)
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}