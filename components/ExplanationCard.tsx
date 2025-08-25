'use client'

import { useState } from 'react'
import { 
  LineItemExplanation, 
  AgentContribution, 
  DecisionFactor,
  ValidationStatus 
} from '@/lib/types/transparency'

interface ExplanationCardProps {
  itemName: string
  status: ValidationStatus
  explanation: LineItemExplanation
  agentContributions?: AgentContribution[]
  decisionFactors?: DecisionFactor[]
  confidenceScore: number
  className?: string
}

export default function ExplanationCard({
  itemName,
  status,
  explanation,
  agentContributions = [],
  decisionFactors = [],
  confidenceScore,
  className = ''
}: ExplanationCardProps) {
  const [expandedLevel, setExpandedLevel] = useState<1 | 2 | 3>(1)
  const [showAgentTrace, setShowAgentTrace] = useState(false)

  const getStatusColor = (status: ValidationStatus) => {
    switch (status) {
      case 'ALLOW':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'NEEDS_REVIEW':
        return 'bg-amber-50 border-amber-200 text-amber-800'
      case 'REJECT':
        return 'bg-red-50 border-red-200 text-red-800'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800'
    }
  }

  const getStatusIcon = (status: ValidationStatus) => {
    switch (status) {
      case 'ALLOW': return '✅'
      case 'NEEDS_REVIEW': return '⚠️'
      case 'REJECT': return '❌'
      default: return '❓'
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-amber-600'
    return 'text-red-600'
  }

  return (
    <div className={`bg-white border rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">{getStatusIcon(status)}</span>
            <div>
              <h3 className="font-medium text-gray-900">{itemName}</h3>
              <div className="flex items-center space-x-3 mt-1">
                <span className={`px-2 py-1 rounded text-sm font-medium ${getStatusColor(status)}`}>
                  {status === 'ALLOW' ? 'Approved' : 
                   status === 'NEEDS_REVIEW' ? 'Needs Review' : 
                   'Rejected'}
                </span>
                <span className={`text-sm font-medium ${getConfidenceColor(confidenceScore)}`}>
                  {Math.round(confidenceScore * 100)}% confidence
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAgentTrace(!showAgentTrace)}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              title="View agent execution details"
            >
              🤖 Agents
            </button>
          </div>
        </div>
      </div>

      {/* Explanation Content */}
      <div className="p-4">
        {/* Level 1: Quick Summary */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Quick Summary</h4>
            <div className="flex space-x-1">
              <button
                onClick={() => setExpandedLevel(1)}
                className={`px-2 py-1 text-xs rounded ${
                  expandedLevel === 1 ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Basic
              </button>
              {explanation.detailed && (
                <button
                  onClick={() => setExpandedLevel(2)}
                  className={`px-2 py-1 text-xs rounded ${
                    expandedLevel === 2 ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Detailed
                </button>
              )}
              {explanation.technical && (
                <button
                  onClick={() => setExpandedLevel(3)}
                  className={`px-2 py-1 text-xs rounded ${
                    expandedLevel === 3 ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Technical
                </button>
              )}
            </div>
          </div>
          
          <div className="text-sm text-gray-700 p-3 bg-gray-50 rounded">
            {explanation.summary}
          </div>
        </div>

        {/* Level 2: Detailed Explanation */}
        {expandedLevel >= 2 && explanation.detailed && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Detailed Analysis</h4>
            <div className="text-sm text-gray-700 p-3 border border-gray-200 rounded whitespace-pre-line">
              {explanation.detailed}
            </div>
          </div>
        )}

        {/* Level 3: Technical Details */}
        {expandedLevel === 3 && explanation.technical && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Technical Details</h4>
            <div className="text-sm text-gray-700 p-3 border border-gray-200 rounded bg-gray-50 font-mono whitespace-pre-line">
              {explanation.technical}
            </div>
          </div>
        )}

        {/* Decision Factors */}
        {explanation.primaryFactors.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Key Decision Factors</h4>
            <div className="flex flex-wrap gap-2">
              {explanation.primaryFactors.map((factor, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                >
                  {factor}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Risk Factors */}
        {explanation.riskFactors.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Risk Factors</h4>
            <div className="flex flex-wrap gap-2">
              {explanation.riskFactors.map((risk, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded"
                >
                  {risk.replace(/_/g, ' ').toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Agent Trace Panel */}
      {showAgentTrace && agentContributions.length > 0 && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            Agent Execution Trace ({agentContributions.length} agents)
          </h4>
          
          <div className="space-y-3">
            {agentContributions.map((agent, index) => (
              <div 
                key={index}
                className="bg-white p-3 border border-gray-200 rounded text-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900">{agent.agentName}</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded capitalize">
                      {agent.stage.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-gray-500">
                    <span>{agent.executionTime}ms</span>
                    <span className={getConfidenceColor(agent.confidence)}>
                      {Math.round(agent.confidence * 100)}%
                    </span>
                  </div>
                </div>
                
                <div className="text-gray-700 mb-2">
                  <strong>Decision:</strong> {agent.decision}
                </div>
                
                {agent.reasoning && (
                  <div className="text-gray-600 text-xs">
                    <strong>Reasoning:</strong> {agent.reasoning}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
            Total execution time: {agentContributions.reduce((sum, agent) => sum + agent.executionTime, 0)}ms
          </div>
        </div>
      )}

      {/* Feedback Section */}
      <div className="border-t border-gray-200 p-3 bg-gray-50">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Was this explanation helpful?</span>
          <div className="flex space-x-2">
            <button className="px-2 py-1 border border-gray-300 rounded hover:bg-white text-gray-600">
              👍 Yes
            </button>
            <button className="px-2 py-1 border border-gray-300 rounded hover:bg-white text-gray-600">
              👎 No
            </button>
            <button className="px-2 py-1 border border-gray-300 rounded hover:bg-white text-gray-600">
              💬 Feedback
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}