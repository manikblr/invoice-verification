'use client'

import { useState } from 'react'
import { AgentExecution, ExecutionSummary } from '@/lib/types/transparency'
import AgentTooltip from './AgentTooltip'
import TextExpandOnHover from './TextExpandOnHover'

interface AgentPipelineVisualizationProps {
  agentExecutions: AgentExecution[]
  executionSummary: ExecutionSummary
  className?: string
}

export default function AgentPipelineVisualization({
  agentExecutions,
  executionSummary,
  className = ''
}: AgentPipelineVisualizationProps) {
  const [selectedAgent, setSelectedAgent] = useState<AgentExecution | null>(null)
  const [viewMode, setViewMode] = useState<'timeline' | 'stages' | 'performance'>('timeline')

  const getStageColor = (stage: string) => {
    const colors = {
      'preprocessing': 'bg-blue-100 border-blue-300 text-blue-800',
      'validation': 'bg-green-100 border-green-300 text-green-800',
      'pricing': 'bg-purple-100 border-purple-300 text-purple-800',
      'compliance': 'bg-orange-100 border-orange-300 text-orange-800',
      'final_decision': 'bg-red-100 border-red-300 text-red-800',
      'item_matching': 'bg-indigo-100 border-indigo-300 text-indigo-800',
      'policy_check': 'bg-pink-100 border-pink-300 text-pink-800'
    }
    return colors[stage as keyof typeof colors] || 'bg-gray-100 border-gray-300 text-gray-800'
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

  const groupByStage = () => {
    return agentExecutions.reduce((acc, exec) => {
      if (!acc[exec.agentStage]) acc[exec.agentStage] = []
      acc[exec.agentStage].push(exec)
      return acc
    }, {} as Record<string, AgentExecution[]>)
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Agent Pipeline Execution</h3>
            <p className="text-sm text-gray-600 mt-1">
              {agentExecutions.length} agents • {formatDuration(executionSummary.totalExecutionTime)} total
            </p>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === 'timeline' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode('stages')}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === 'stages' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Stages
            </button>
            <button
              onClick={() => setViewMode('performance')}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === 'performance' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Performance
            </button>
          </div>
        </div>
      </div>

      {/* Execution Summary */}
      <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="text-center">
                    <div className="font-medium text-gray-900 text-2xl">{executionSummary.totalAgents}</div>
                    <div className="text-gray-600">Total Agents</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-gray-900 text-2xl">{Math.round(executionSummary.averageConfidence * 100)}%</div>
                    <div className="text-gray-600">Avg Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-gray-900 text-2xl">{executionSummary.errorCount}</div>
                    <div className="text-gray-600">Errors</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-gray-900 text-2xl">
                      {Math.round(((executionSummary.totalAgents - executionSummary.errorCount) / executionSummary.totalAgents) * 100)}%
                    </div>
                    <div className="text-gray-600">Success Rate</div>
                  </div>
                </div>
                
                {executionSummary.bottlenecks.length > 0 && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded">
                    <div className="flex items-center">
                      <svg className="h-5 w-5 text-amber-500 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div className="text-sm font-medium text-amber-800">Performance Bottlenecks:</div>
                    </div>
                    <div className="text-sm text-amber-700 mt-1">
                      {executionSummary.bottlenecks.join(', ')}
                    </div>
                  </div>
                )}
              </div>

      {/* Main Content */}
      <div className="p-4">
        {viewMode === 'timeline' && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Execution Timeline</h4>
            <div className="space-y-2">
              {agentExecutions.map((agent, index) => (
                <div
                  key={agent.id}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    selectedAgent?.id === agent.id 
                      ? 'border-blue-300 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-mono text-gray-500">#{index + 1}</span>
                        <span className="text-sm">{getStatusIcon(agent.status)}</span>
                      </div>
                      <div>
                        <AgentTooltip agentName={agent.agentName} agentExecution={agent}>
                          <div className="font-medium text-blue-600 hover:text-blue-800 cursor-help border-b border-dotted border-blue-300">
                            {agent.agentName}
                          </div>
                        </AgentTooltip>
                        <div className="text-xs text-gray-600">{agent.agentVersion}</div>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded border ${getStageColor(agent.agentStage)}`}>
                        {agent.agentStage.replace(/_/g, ' ')}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-3 text-xs text-gray-500">
                      <span>{formatDuration(agent.executionTime)}</span>
                      {agent.confidenceScore && (
                        <span>{Math.round(agent.confidenceScore * 100)}%</span>
                      )}
                      <span>{new Date(agent.startTime).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  
                  {selectedAgent?.id === agent.id && (
                    <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Input Data</h5>
                          <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                            {JSON.stringify(agent.inputData, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Output Data</h5>
                          <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                            {JSON.stringify(agent.outputData, null, 2)}
                          </pre>
                        </div>
                      </div>
                      
                      {agent.decisionRationale && (
                        <div className="mt-3">
                          <h5 className="font-medium text-gray-900 mb-1">Decision Rationale</h5>
                          <TextExpandOnHover 
                            text={agent.decisionRationale}
                            maxLength={150}
                            className="text-gray-700"
                            showCopyButton={true}
                          />
                        </div>
                      )}
                      
                      {agent.toolsUsed.length > 0 && (
                        <div className="mt-3">
                          <h5 className="font-medium text-gray-900 mb-1">Tools Used</h5>
                          <div className="flex flex-wrap gap-1">
                            {agent.toolsUsed.map((tool, idx) => (
                              <span key={idx} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded">
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {agent.dataSourcesAccessed.length > 0 && (
                        <div className="mt-3">
                          <h5 className="font-medium text-gray-900 mb-1">Data Sources Accessed</h5>
                          <div className="flex flex-wrap gap-1">
                            {agent.dataSourcesAccessed.map((source, idx) => (
                              <span key={idx} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                {source}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="mt-3">
                        <h5 className="font-medium text-gray-900 mb-1">Prompt Template</h5>
                        <div className="bg-blue-50 p-2 rounded text-xs">
                          <p>
                            System prompt for {agent.agentName}: Execute {agent.agentStage.replace(/_/g, ' ')} stage validation with provided context and business rules. Return structured decision with confidence scoring.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {viewMode === 'stages' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">Execution by Stages</h4>
            {Object.entries(groupByStage()).map(([stage, agents]) => (
              <div key={stage} className="border border-gray-200 rounded">
                <div className={`px-3 py-2 border-b border-gray-200 ${getStageColor(stage)}`}>
                  <div className="flex items-center justify-between">
                    <h5 className="font-medium capitalize">{stage.replace(/_/g, ' ')}</h5>
                    <div className="text-xs">
                      {agents.length} agents • {formatDuration(agents.reduce((sum, a) => sum + a.executionTime, 0))}
                    </div>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {agents.map(agent => (
                    <div key={agent.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center space-x-2">
                        <span>{getStatusIcon(agent.status)}</span>
                        <AgentTooltip agentName={agent.agentName} agentExecution={agent}>
                          <span className="font-medium text-blue-600 hover:text-blue-800 cursor-help border-b border-dotted border-blue-300">
                            {agent.agentName}
                          </span>
                        </AgentTooltip>
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-gray-500">
                        <span>{formatDuration(agent.executionTime)}</span>
                        {agent.confidenceScore && (
                          <span>{Math.round(agent.confidenceScore * 100)}%</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'performance' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">Performance Analysis</h4>
            
            {/* Critical Path */}
            <div className="border border-gray-200 rounded p-3">
              <h5 className="font-medium text-gray-900 mb-2">Critical Path (Slowest Agents)</h5>
              <div className="space-y-2">
                {executionSummary.criticalPath.map((agentName, index) => {
                  const agent = agentExecutions.find(a => a.agentName === agentName)
                  return agent ? (
                    <div key={agentName} className="flex items-center justify-between py-1">
                      <span className="text-sm">{index + 1}. {agentName}</span>
                      <span className="text-xs text-gray-500">{formatDuration(agent.executionTime)}</span>
                    </div>
                  ) : null
                })}
              </div>
            </div>
            
            {/* Execution Time Distribution */}
            <div className="border border-gray-200 rounded p-3">
              <h5 className="font-medium text-gray-900 mb-2">Execution Time Distribution</h5>
              <div className="space-y-1">
                {agentExecutions
                  .sort((a, b) => b.executionTime - a.executionTime)
                  .map(agent => {
                    const percentage = (agent.executionTime / executionSummary.totalExecutionTime) * 100
                    return (
                      <div key={agent.id} className="flex items-center space-x-2">
                        <div className="w-24 text-xs text-gray-600 truncate">{agent.agentName}</div>
                        <div className="flex-1 bg-gray-200 rounded h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded"
                            style={{ width: `${Math.max(percentage, 2)}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 w-12 text-right">{percentage.toFixed(1)}%</div>
                      </div>
                    )
                  })
                }
              </div>
            </div>
            
            {/* Success/Failure Analysis */}
            <div className="border border-gray-200 rounded p-3">
              <h5 className="font-medium text-gray-900 mb-2">Execution Results</h5>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-green-600 font-medium">
                    ✅ Successful: {agentExecutions.filter(a => a.status === 'SUCCESS').length}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Average confidence: {Math.round(
                      agentExecutions
                        .filter(a => a.status === 'SUCCESS' && a.confidenceScore)
                        .reduce((sum, a) => sum + (a.confidenceScore || 0), 0) /
                      agentExecutions.filter(a => a.status === 'SUCCESS' && a.confidenceScore).length * 100
                    )}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-red-600 font-medium">
                    ❌ Failed: {agentExecutions.filter(a => a.status === 'FAILED').length}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Timeout: {agentExecutions.filter(a => a.status === 'TIMEOUT').length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}