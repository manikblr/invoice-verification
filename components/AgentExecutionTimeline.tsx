'use client'

import { useState } from 'react'
import { AgentExecution, EnhancedLineItemResult } from '@/lib/types/transparency'
import { getAgentDescription } from '@/lib/agent-descriptions'
import TextExpandOnHover from './TextExpandOnHover'

interface AgentExecutionTimelineProps {
  agentExecutions: AgentExecution[]
  lineItem?: EnhancedLineItemResult
  className?: string
}

export default function AgentExecutionTimeline({
  agentExecutions,
  lineItem,
  className = ''
}: AgentExecutionTimelineProps) {
  const [selectedAgent, setSelectedAgent] = useState<AgentExecution | null>(null)
  const [showDetails, setShowDetails] = useState(true)

  // Sort agents by execution time to show actual execution order
  const sortedAgents = [...agentExecutions].sort((a, b) => 
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )

  const getStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      'preprocessing': 'bg-blue-100 border-blue-300 text-blue-800',
      'validation': 'bg-green-100 border-green-300 text-green-800',
      'pricing': 'bg-purple-100 border-purple-300 text-purple-800',
      'compliance': 'bg-orange-100 border-orange-300 text-orange-800',
      'final_decision': 'bg-red-100 border-red-300 text-red-800',
      'item_matching': 'bg-indigo-100 border-indigo-300 text-indigo-800',
      'policy_check': 'bg-pink-100 border-pink-300 text-pink-800',
      'ingestion': 'bg-teal-100 border-teal-300 text-teal-800',
      'explanation': 'bg-yellow-100 border-yellow-300 text-yellow-800',
      'orchestration': 'bg-gray-100 border-gray-300 text-gray-800'
    }
    return colors[stage] || 'bg-gray-100 border-gray-300 text-gray-800'
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'SUCCESS': 'bg-green-500',
      'FAILED': 'bg-red-500',
      'TIMEOUT': 'bg-yellow-500',
      'SKIPPED': 'bg-gray-500'
    }
    return colors[status] || 'bg-gray-500'
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Agent Execution Timeline</h3>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          {sortedAgents.length} agents executed in sequence • Total time: {formatDuration(agentExecutions.reduce((sum, a) => sum + a.executionTime, 0))}
        </p>
      </div>

      <div className="p-4">
        {/* Visual Timeline */}
        <div className="relative pl-8 pb-4 border-l-2 border-gray-200 ml-4">
          {sortedAgents.map((agent, index) => {
            const agentDesc = getAgentDescription(agent.agentName)
            const isLast = index === sortedAgents.length - 1
            
            return (
              <div key={agent.id} className="relative mb-6 last:mb-0">
                {/* Timeline Dot */}
                <div className={`absolute -left-11 w-6 h-6 rounded-full flex items-center justify-center ${getStatusColor(agent.status)}`}>
                  <span className="text-white text-xs">{index + 1}</span>
                </div>
                
                {/* Connection Line */}
                {!isLast && (
                  <div className="absolute -left-9 top-6 w-0.5 h-16 bg-gray-200"></div>
                )}
                
                {/* Agent Card */}
                <div 
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedAgent?.id === agent.id 
                      ? 'border-blue-500 bg-blue-50 shadow-md' 
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                  onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium text-gray-900 flex items-center">
                          <span className="mr-2">{agentDesc?.icon || '🤖'}</span>
                          {agent.agentName}
                        </h4>
                        <span className={`px-2 py-1 text-xs rounded border ${getStageColor(agent.agentStage)}`}>
                          {agent.agentStage.replace(/_/g, ' ')}
                        </span>
                      </div>
                      
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500">Status:</span>
                          <span className={`ml-1 font-medium ${
                            agent.status === 'SUCCESS' ? 'text-green-600' :
                            agent.status === 'FAILED' ? 'text-red-600' :
                            'text-yellow-600'
                          }`}>
                            {agent.status}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Time:</span>
                          <span className="ml-1 font-medium text-gray-900">{formatDuration(agent.executionTime)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Started:</span>
                          <span className="ml-1 font-medium text-gray-900">{formatDate(agent.startTime)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Confidence:</span>
                          <span className="ml-1 font-medium text-gray-900">
                            {agent.confidenceScore ? `${Math.round(agent.confidenceScore * 100)}%` : 'N/A'}
                          </span>
                        </div>
                      </div>
                      
                      {agent.decisionRationale && (
                        <div className="mt-2">
                          <span className="text-xs text-gray-500">Decision:</span>
                          <TextExpandOnHover 
                            text={agent.decisionRationale}
                            maxLength={80}
                            className="text-sm text-gray-700 mt-1"
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">v{agent.agentVersion}</span>
                      <button className="text-gray-400 hover:text-gray-600">
                        {selectedAgent?.id === agent.id ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {showDetails && selectedAgent?.id === agent.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Input Data</h5>
                          <div className="bg-gray-50 p-3 rounded text-xs max-h-40 overflow-auto">
                            <pre className="whitespace-pre-wrap">
                              {JSON.stringify(agent.inputData, null, 2)}
                            </pre>
                          </div>
                        </div>
                        
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Output Data</h5>
                          <div className="bg-gray-50 p-3 rounded text-xs max-h-40 overflow-auto">
                            <pre className="whitespace-pre-wrap">
                              {JSON.stringify(agent.outputData, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4">
                        <h5 className="font-medium text-gray-900 mb-2">Prompt Template</h5>
                        <div className="bg-blue-50 p-3 rounded text-xs">
                          <p className="text-gray-700">
                            System prompt for {agent.agentName}: Execute {agent.agentStage.replace(/_/g, ' ')} stage validation with provided context and business rules. Return structured decision with confidence scoring.
                          </p>
                        </div>
                      </div>
                      
                      {agent.toolsUsed.length > 0 && (
                        <div className="mt-4">
                          <h5 className="font-medium text-gray-900 mb-2">Tools Used</h5>
                          <div className="flex flex-wrap gap-2">
                            {agent.toolsUsed.map((tool, idx) => (
                              <span 
                                key={idx} 
                                className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {agent.dataSourcesAccessed.length > 0 && (
                        <div className="mt-4">
                          <h5 className="font-medium text-gray-900 mb-2">Data Sources Accessed</h5>
                          <div className="flex flex-wrap gap-2">
                            {agent.dataSourcesAccessed.map((source, idx) => (
                              <span 
                                key={idx} 
                                className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded"
                              >
                                {source}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        
        {/* Summary Stats */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">Execution Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-2xl font-bold text-gray-900">{sortedAgents.length}</div>
              <div className="text-sm text-gray-600">Total Agents</div>
            </div>
            <div className="bg-green-50 p-3 rounded">
              <div className="text-2xl font-bold text-green-700">
                {sortedAgents.filter(a => a.status === 'SUCCESS').length}
              </div>
              <div className="text-sm text-green-600">Successful</div>
            </div>
            <div className="bg-amber-50 p-3 rounded">
              <div className="text-2xl font-bold text-amber-700">
                {Math.round(agentExecutions.reduce((sum, a) => sum + (a.confidenceScore || 0), 0) / agentExecutions.length * 100)}%
              </div>
              <div className="text-sm text-amber-600">Avg Confidence</div>
            </div>
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-2xl font-bold text-blue-700">
                {formatDuration(agentExecutions.reduce((sum, a) => sum + a.executionTime, 0))}
              </div>
              <div className="text-sm text-blue-600">Total Time</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}