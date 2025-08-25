'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getAgentTraces } from '@/lib/transparency-api'
import { AgentExecution } from '@/lib/types/transparency'
import AgentPipelineVisualization from '@/components/AgentPipelineVisualization'
import Link from 'next/link'

interface AgentTraceResponse {
  invoiceId: string
  sessionId: string
  totalExecutions: number
  statistics: any
  executions: AgentExecution[]
}

export default function AgentTracePage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.invoiceId as string
  
  const [traceData, setTraceData] = useState<AgentTraceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentExecution | null>(null)
  const [filterStage, setFilterStage] = useState<string>('all')
  const [includeReasoning, setIncludeReasoning] = useState(true)

  useEffect(() => {
    if (invoiceId) {
      loadAgentTraces()
    }
  }, [invoiceId, filterStage, includeReasoning])

  const loadAgentTraces = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const traces = await getAgentTraces(invoiceId, {
        stage: filterStage === 'all' ? undefined : filterStage,
        includeReasoning
      })
      
      setTraceData(traces)
      
    } catch (err) {
      console.error('Failed to load agent traces:', err)
      setError('Failed to load agent traces')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading agent execution traces...</p>
        </div>
      </div>
    )
  }

  if (error || !traceData) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center py-16">
          <div className="text-red-600 text-6xl mb-4">🤖❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Agent Traces Not Found</h2>
          <p className="text-gray-600 mb-6">
            {error || `No agent execution traces found for invoice ${invoiceId}`}
          </p>
          <div className="space-x-4">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Go Back
            </button>
            <Link
              href={`/history/${invoiceId}`}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              View Validation Details
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const getStageColor = (stage: string) => {
    const colors = {
      'preprocessing': 'bg-blue-100 text-blue-800 border-blue-200',
      'validation': 'bg-green-100 text-green-800 border-green-200',
      'pricing': 'bg-purple-100 text-purple-800 border-purple-200',
      'compliance': 'bg-orange-100 text-orange-800 border-orange-200',
      'final_decision': 'bg-red-100 text-red-800 border-red-200'
    }
    return colors[stage as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return '✅'
      case 'FAILED': return '❌'
      case 'TIMEOUT': return '⏱️'
      case 'SKIPPED': return '⏭️'
      default: return '❓'
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  // Get unique stages for filter
  const availableStages = Array.from(new Set(traceData.executions.map(exec => exec.agentStage)))

  // Create execution summary for visualization
  const executionSummary = {
    totalAgents: traceData.executions.length,
    totalExecutionTime: traceData.statistics.totalExecutionTime || 0,
    averageConfidence: traceData.executions
      .filter(exec => exec.confidenceScore)
      .reduce((sum, exec) => sum + (exec.confidenceScore || 0), 0) / Math.max(1, traceData.executions.filter(exec => exec.confidenceScore).length),
    criticalPath: traceData.statistics.stageBreakdown 
      ? Object.keys(traceData.statistics.stageBreakdown).sort()
      : [],
    bottlenecks: [],
    errorCount: traceData.executions.filter(exec => exec.status === 'FAILED').length
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-4 mb-4">
          <button
            onClick={() => router.back()}
            className="flex items-center text-gray-600 hover:text-gray-800"
          >
            ← Back
          </button>
          <div className="h-6 border-l border-gray-300"></div>
          <Link
            href={`/history/${invoiceId}`}
            className="text-blue-600 hover:text-blue-800"
          >
            Validation Details
          </Link>
          <div className="h-6 border-l border-gray-300"></div>
          <Link
            href="/history"
            className="text-blue-600 hover:text-blue-800"
          >
            All History
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🤖 Agent Execution Trace
            </h1>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <code className="bg-gray-100 px-2 py-1 rounded font-mono">
                {invoiceId}
              </code>
              <span>•</span>
              <span>{traceData.totalExecutions} executions</span>
              <span>•</span>
              <span>{formatDuration(traceData.statistics.totalExecutionTime || 0)} total</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded border border-blue-200">
              {traceData.statistics.successRate || 0}% success rate
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filter by Stage
              </label>
              <select
                value={filterStage}
                onChange={(e) => setFilterStage(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Stages</option>
                {availableStages.map(stage => (
                  <option key={stage} value={stage}>
                    {stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="includeReasoning"
                checked={includeReasoning}
                onChange={(e) => setIncludeReasoning(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="includeReasoning" className="text-sm text-gray-700">
                Include detailed reasoning
              </label>
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            Showing {traceData.executions.length} of {traceData.totalExecutions} executions
          </div>
        </div>
      </div>

      {/* Agent Pipeline Visualization */}
      <AgentPipelineVisualization
        agentExecutions={traceData.executions}
        executionSummary={executionSummary}
        className="mb-6"
      />

      {/* Detailed Agent List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Detailed Agent Executions ({traceData.executions.length})
          </h2>
        </div>

        <div className="divide-y divide-gray-200">
          {traceData.executions.map((execution, index) => (
            <div key={execution.id} className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono text-gray-500">#{execution.executionOrder}</span>
                    <span className="text-lg">{getStatusIcon(execution.status)}</span>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold text-gray-900">{execution.agentName}</h3>
                    <div className="flex items-center space-x-3 mt-1">
                      <span className={`px-2 py-1 text-xs font-medium rounded border ${getStageColor(execution.agentStage)}`}>
                        {execution.agentStage.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-500">v{execution.agentVersion}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-6 text-sm text-gray-600">
                  <div className="text-right">
                    <div className="font-medium">{formatDuration(execution.executionTime)}</div>
                    <div className="text-xs">execution time</div>
                  </div>
                  {execution.confidenceScore && (
                    <div className="text-right">
                      <div className="font-medium">{Math.round(execution.confidenceScore * 100)}%</div>
                      <div className="text-xs">confidence</div>
                    </div>
                  )}
                  <div className="text-right">
                    <div className="text-xs text-gray-500">
                      {new Date(execution.startTime).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Agent Tools Used */}
              {execution.toolsUsed && execution.toolsUsed.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">🛠️ Tools Used</h4>
                  <div className="flex flex-wrap gap-1">
                    {execution.toolsUsed.map((tool, idx) => (
                      <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Decision Rationale */}
              {execution.decisionRationale && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">💭 Decision Rationale</h4>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">{execution.decisionRationale}</p>
                </div>
              )}

              {/* Input/Output Data */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">📥 Input Data</h4>
                  <div className="bg-gray-50 p-3 rounded text-xs font-mono max-h-32 overflow-auto">
                    <pre>{JSON.stringify(execution.inputData, null, 2)}</pre>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">📤 Output Data</h4>
                  <div className="bg-gray-50 p-3 rounded text-xs font-mono max-h-32 overflow-auto">
                    <pre>{JSON.stringify(execution.outputData, null, 2)}</pre>
                  </div>
                </div>
              </div>

              {/* Detailed Reasoning (if available and requested) */}
              {includeReasoning && execution.reasoning && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">🧠 Detailed Reasoning</h4>
                  <div className="bg-blue-50 p-3 rounded text-sm">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(execution.reasoning, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Statistics Summary */}
      {traceData.statistics && (
        <div className="mt-6 bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Execution Statistics</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Performance Stats */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">⚡ Performance</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Time:</span>
                  <span className="font-medium">{formatDuration(traceData.statistics.totalExecutionTime || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Average Time:</span>
                  <span className="font-medium">{formatDuration(traceData.statistics.averageExecutionTime || 0)}</span>
                </div>
                {traceData.statistics.fastestExecution && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fastest:</span>
                    <span className="font-medium">
                      {traceData.statistics.fastestExecution.agent} ({formatDuration(traceData.statistics.fastestExecution.time)})
                    </span>
                  </div>
                )}
                {traceData.statistics.slowestExecution && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Slowest:</span>
                    <span className="font-medium">
                      {traceData.statistics.slowestExecution.agent} ({formatDuration(traceData.statistics.slowestExecution.time)})
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Stage Breakdown */}
            {traceData.statistics.stageBreakdown && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">🏗️ Stage Breakdown</h4>
                <div className="space-y-2 text-sm">
                  {Object.entries(traceData.statistics.stageBreakdown).map(([stage, stats]: [string, any]) => (
                    <div key={stage} className="flex justify-between">
                      <span className="text-gray-600">{stage.replace(/_/g, ' ')}:</span>
                      <span className="font-medium">{stats.count} ({formatDuration(stats.totalTime)})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent Breakdown */}
            {traceData.statistics.agentBreakdown && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">🤖 Agent Performance</h4>
                <div className="space-y-2 text-sm">
                  {Object.entries(traceData.statistics.agentBreakdown)
                    .sort(([,a]: [string, any], [,b]: [string, any]) => b.totalTime - a.totalTime)
                    .slice(0, 5)
                    .map(([agent, stats]: [string, any]) => (
                    <div key={agent} className="flex justify-between">
                      <span className="text-gray-600 truncate">{agent}:</span>
                      <span className="font-medium ml-2">{formatDuration(stats.totalTime)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}