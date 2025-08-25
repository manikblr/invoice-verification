'use client'

import { useState } from 'react'
import { 
  LineItemExplanation, 
  AgentContribution, 
  DecisionFactor,
  ValidationStatus 
} from '@/lib/types/transparency'
import AgentTooltip from './AgentTooltip'
import TextExpandOnHover from './TextExpandOnHover'
import { getAgentDescription } from '@/lib/agent-descriptions'

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
          
          {/* Enhanced Agent Table with Tooltips and Prompt Column */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Agent</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Stage</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Decision</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Reasoning</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Prompt Used</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Performance</th>
                </tr>
              </thead>
              <tbody>
                {agentContributions.map((agent, index) => {
                  const agentDesc = getAgentDescription(agent.agentName)
                  return (
                    <tr key={index} className="border-t border-gray-200 hover:bg-gray-50">
                      {/* Agent Name with Tooltip */}
                      <td className="py-2 px-3">
                        <AgentTooltip agentName={agent.agentName}>
                          <span className="font-medium text-blue-600 hover:text-blue-800 cursor-help border-b border-dotted border-blue-300">
                            {agentDesc?.icon} {agent.agentName}
                          </span>
                        </AgentTooltip>
                      </td>
                      
                      {/* Stage */}
                      <td className="py-2 px-3">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded capitalize">
                          {agent.stage.replace(/_/g, ' ')}
                        </span>
                      </td>
                      
                      {/* Decision */}
                      <td className="py-2 px-3">
                        <TextExpandOnHover 
                          text={agent.decision}
                          maxLength={30}
                          className="font-medium text-gray-900"
                        />
                      </td>
                      
                      {/* Reasoning with Expand on Hover */}
                      <td className="py-2 px-3 max-w-xs">
                        {agent.reasoning ? (
                          <TextExpandOnHover 
                            text={agent.reasoning}
                            maxLength={60}
                            className="text-gray-600"
                            showCopyButton={true}
                          />
                        ) : (
                          <span className="text-gray-400 italic">No reasoning provided</span>
                        )}
                      </td>
                      
                      {/* Prompt Used */}
                      <td className="py-2 px-3 max-w-xs">
                        {agent.reasoning && agent.reasoning.length > 100 ? (
                          <TextExpandOnHover 
                            text={`System prompt for ${agent.agentName}: Execute ${agent.stage} stage validation with provided context and business rules. Return structured decision with confidence scoring.`}
                            maxLength={40}
                            className="text-blue-600 font-mono text-xs"
                            showCopyButton={true}
                          />
                        ) : (
                          <span className="text-gray-400 italic text-xs">Standard prompt</span>
                        )}
                      </td>
                      
                      {/* Performance Metrics */}
                      <td className="py-2 px-3">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="text-gray-500">Time:</span>
                            <span className={`font-mono ${
                              agent.executionTime > 1000 ? 'text-red-600' :
                              agent.executionTime > 500 ? 'text-amber-600' :
                              'text-green-600'
                            }`}>
                              {agent.executionTime}ms
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="text-gray-500">Confidence:</span>
                            <span className={getConfidenceColor(agent.confidence)}>
                              {Math.round(agent.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          {/* Agent Execution Summary */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="text-center">
                <div className="font-medium text-gray-900">{agentContributions.length}</div>
                <div className="text-gray-600">Agents</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-gray-900">{agentContributions.reduce((sum, agent) => sum + agent.executionTime, 0)}ms</div>
                <div className="text-gray-600">Total Time</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-gray-900">{Math.round(agentContributions.reduce((sum, agent) => sum + agent.confidence, 0) / agentContributions.length * 100)}%</div>
                <div className="text-gray-600">Avg Confidence</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-gray-900">{agentContributions.filter(a => a.confidence > 0.8).length}</div>
                <div className="text-gray-600">High Confidence</div>
              </div>
            </div>
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