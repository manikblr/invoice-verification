import { NextRequest, NextResponse } from 'next/server'
import { transparencyDB } from '@/lib/transparency-db'

export const dynamic = 'force-dynamic'

// Get detailed agent execution traces for a specific invoice
export async function GET(
  req: NextRequest,
  { params }: { params: { invoiceId: string } }
) {
  try {
    const { invoiceId } = params
    const { searchParams } = new URL(req.url)
    
    // Optional filters
    const agentName = searchParams.get('agentName')
    const stage = searchParams.get('stage')
    const includeReasoning = searchParams.get('includeReasoning') === 'true'
    
    console.log(`Fetching agent traces for invoice: ${invoiceId}`)
    
    // Get the validation session first
    const session = await transparencyDB.getValidationSession(invoiceId)
    if (!session) {
      return NextResponse.json(
        { error: 'Validation session not found' },
        { status: 404 }
      )
    }
    
    // Get all agent executions for this session
    let agentExecutions = await transparencyDB.getAgentExecutions(session.id)
    
    // Apply filters if provided
    if (agentName) {
      agentExecutions = agentExecutions.filter(exec => 
        exec.agentName.toLowerCase().includes(agentName.toLowerCase())
      )
    }
    
    if (stage) {
      agentExecutions = agentExecutions.filter(exec => exec.agentStage === stage)
    }
    
    // Optionally strip reasoning for lighter response
    if (!includeReasoning) {
      agentExecutions = agentExecutions.map(exec => ({
        ...exec,
        reasoning: undefined,
        inputData: Object.keys(exec.inputData).length > 10 ? { summary: 'Large input data' } : exec.inputData,
        outputData: Object.keys(exec.outputData).length > 10 ? { summary: 'Large output data' } : exec.outputData
      }))
    }
    
    // Calculate execution statistics
    const stats = calculateExecutionStats(agentExecutions)
    
    return NextResponse.json({
      success: true,
      invoiceId,
      sessionId: session.id,
      totalExecutions: agentExecutions.length,
      statistics: stats,
      executions: agentExecutions
    })
    
  } catch (error) {
    console.error('Error fetching agent traces:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch agent traces', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

function calculateExecutionStats(executions: any[]) {
  if (executions.length === 0) {
    return {
      totalExecutionTime: 0,
      averageExecutionTime: 0,
      fastestExecution: null,
      slowestExecution: null,
      successRate: 0,
      stageBreakdown: {},
      agentBreakdown: {}
    }
  }
  
  const totalTime = executions.reduce((sum, exec) => sum + exec.executionTime, 0)
  const successCount = executions.filter(exec => exec.status === 'SUCCESS').length
  const sortedByTime = [...executions].sort((a, b) => a.executionTime - b.executionTime)
  
  // Group by stage
  const stageBreakdown = executions.reduce((acc, exec) => {
    acc[exec.agentStage] = acc[exec.agentStage] || { count: 0, totalTime: 0 }
    acc[exec.agentStage].count++
    acc[exec.agentStage].totalTime += exec.executionTime
    return acc
  }, {} as Record<string, { count: number, totalTime: number }>)
  
  // Group by agent
  const agentBreakdown = executions.reduce((acc, exec) => {
    acc[exec.agentName] = acc[exec.agentName] || { count: 0, totalTime: 0, avgConfidence: 0 }
    acc[exec.agentName].count++
    acc[exec.agentName].totalTime += exec.executionTime
    acc[exec.agentName].avgConfidence = (acc[exec.agentName].avgConfidence + (exec.confidenceScore || 0)) / 2
    return acc
  }, {} as Record<string, { count: number, totalTime: number, avgConfidence: number }>)
  
  return {
    totalExecutionTime: totalTime,
    averageExecutionTime: Math.round(totalTime / executions.length),
    fastestExecution: {
      agent: sortedByTime[0].agentName,
      time: sortedByTime[0].executionTime
    },
    slowestExecution: {
      agent: sortedByTime[sortedByTime.length - 1].agentName,
      time: sortedByTime[sortedByTime.length - 1].executionTime
    },
    successRate: Math.round((successCount / executions.length) * 100),
    stageBreakdown,
    agentBreakdown
  }
}