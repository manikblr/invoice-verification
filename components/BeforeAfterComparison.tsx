'use client'

import { useState } from 'react'

interface ValidationResult {
  status: 'ALLOW' | 'NEEDS_REVIEW' | 'REJECT'
  confidenceScore: number
  explanation: {
    summary: string
    reasoning: string[]
  }
  decisionFactors?: any[]
  agentTraces?: any[]
  executionTime?: number
}

interface BeforeAfterComparisonProps {
  itemName: string
  beforeResult: ValidationResult
  afterResult: ValidationResult
  userContext: string
  className?: string
}

export default function BeforeAfterComparison({
  itemName,
  beforeResult,
  afterResult,
  userContext,
  className = ''
}: BeforeAfterComparisonProps) {
  const [showDetails, setShowDetails] = useState(false)
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ALLOW': return 'text-green-700 bg-green-100 border-green-200'
      case 'NEEDS_REVIEW': return 'text-amber-700 bg-amber-100 border-amber-200'
      case 'REJECT': return 'text-red-700 bg-red-100 border-red-200'
      default: return 'text-gray-700 bg-gray-100 border-gray-200'
    }
  }
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ALLOW': return '✅'
      case 'NEEDS_REVIEW': return '⚠️'
      case 'REJECT': return '❌'
      default: return '❓'
    }
  }
  
  const getImprovementIndicator = () => {
    const statusOrder = { 'REJECT': 0, 'NEEDS_REVIEW': 1, 'ALLOW': 2 }
    const beforeOrder = statusOrder[beforeResult.status] || 1
    const afterOrder = statusOrder[afterResult.status] || 1
    
    if (afterOrder > beforeOrder) {
      return { type: 'improved', icon: '📈', text: 'Improved', color: 'text-green-600' }
    } else if (afterOrder < beforeOrder) {
      return { type: 'declined', icon: '📉', text: 'Declined', color: 'text-red-600' }
    } else {
      return { type: 'unchanged', icon: '➡️', text: 'Unchanged', color: 'text-gray-600' }
    }
  }
  
  const getConfidenceChange = () => {
    const change = afterResult.confidenceScore - beforeResult.confidenceScore
    const changePercent = Math.round(change * 100)
    
    if (changePercent > 0) {
      return { type: 'increased', text: `+${changePercent}%`, color: 'text-green-600', icon: '⬆️' }
    } else if (changePercent < 0) {
      return { type: 'decreased', text: `${changePercent}%`, color: 'text-red-600', icon: '⬇️' }
    } else {
      return { type: 'unchanged', text: 'No change', color: 'text-gray-600', icon: '➡️' }
    }
  }
  
  const improvement = getImprovementIndicator()
  const confidenceChange = getConfidenceChange()
  
  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
            <span>🔄</span>
            <span>Impact of Your Additional Context</span>
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            See how your explanation changed our AI's decision for "<strong>{itemName}</strong>"
          </p>
        </div>
        
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${
          improvement.type === 'improved' ? 'bg-green-100 text-green-800' :
          improvement.type === 'declined' ? 'bg-red-100 text-red-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          <span>{improvement.icon}</span>
          <span>{improvement.text}</span>
        </div>
      </div>
      
      {/* Your Context */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">💬 Your Additional Context:</h4>
        <p className="text-blue-800 italic">"{userContext}"</p>
      </div>
      
      {/* Before/After Comparison Grid */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Before */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center space-x-2">
            <span>⏪</span>
            <span>Before Your Context</span>
          </h4>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Decision:</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(beforeResult.status)}`}>
                {getStatusIcon(beforeResult.status)} {beforeResult.status}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Confidence:</span>
              <span className="text-sm font-medium">
                {Math.round(beforeResult.confidenceScore * 100)}%
              </span>
            </div>
            
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-700">
                {beforeResult.explanation.summary.length > 100 
                  ? beforeResult.explanation.summary.substring(0, 100) + '...'
                  : beforeResult.explanation.summary}
              </p>
            </div>
          </div>
        </div>
        
        {/* After */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-3 flex items-center space-x-2">
            <span>⏩</span>
            <span>After Your Context</span>
          </h4>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-700">Decision:</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(afterResult.status)}`}>
                {getStatusIcon(afterResult.status)} {afterResult.status}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-700">Confidence:</span>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">
                  {Math.round(afterResult.confidenceScore * 100)}%
                </span>
                <span className={`text-xs ${confidenceChange.color}`}>
                  {confidenceChange.icon} {confidenceChange.text}
                </span>
              </div>
            </div>
            
            <div className="pt-2 border-t border-blue-200">
              <p className="text-xs text-blue-800">
                {afterResult.explanation.summary.length > 100 
                  ? afterResult.explanation.summary.substring(0, 100) + '...'
                  : afterResult.explanation.summary}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Key Changes Summary */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4 mb-4">
        <h4 className="font-medium text-indigo-900 mb-3">🎯 What Changed:</h4>
        
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="font-medium text-indigo-900">Decision Status</div>
            <div className={`text-lg ${improvement.color}`}>
              {beforeResult.status} → {afterResult.status}
            </div>
            <div className="text-xs text-indigo-600">{improvement.text}</div>
          </div>
          
          <div className="text-center">
            <div className="font-medium text-indigo-900">Confidence Score</div>
            <div className={`text-lg ${confidenceChange.color}`}>
              {Math.round(beforeResult.confidenceScore * 100)}% → {Math.round(afterResult.confidenceScore * 100)}%
            </div>
            <div className="text-xs text-indigo-600">{confidenceChange.text}</div>
          </div>
          
          <div className="text-center">
            <div className="font-medium text-indigo-900">Processing Time</div>
            <div className="text-lg text-indigo-800">
              {afterResult.executionTime ? `${afterResult.executionTime}ms` : 'N/A'}
            </div>
            <div className="text-xs text-indigo-600">Re-validation time</div>
          </div>
        </div>
      </div>
      
      {/* Why This Happened */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="font-medium text-yellow-900 mb-2">💡 Why This Happened:</h4>
        <p className="text-sm text-yellow-800">
          {improvement.type === 'improved' && (
            <>Your additional context provided crucial information that helped our AI agents better understand the item. 
            This led to a more accurate classification and {afterResult.status === 'ALLOW' ? 'approval' : 'improved assessment'}.</>
          )}
          {improvement.type === 'declined' && (
            <>Your additional context revealed concerns that our AI agents needed to factor into the decision. 
            This led to a more cautious assessment for compliance reasons.</>
          )}
          {improvement.type === 'unchanged' && (
            <>Your additional context was considered by our AI agents, but it didn't change the fundamental assessment. 
            The original decision remains the most appropriate based on our business rules.</>
          )}
        </p>
      </div>
      
      {/* Toggle Detailed View */}
      <div className="mt-4 text-center">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          {showDetails ? 'Hide' : 'Show'} Agent-Level Changes
        </button>
      </div>
      
      {/* Detailed Agent Comparison */}
      {showDetails && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h5 className="font-medium text-gray-900 mb-3">🤖 Agent-Level Analysis:</h5>
          
          <div className="text-sm text-gray-700 space-y-2">
            <p><strong>Before:</strong> {beforeResult.explanation.reasoning?.join(', ') || 'Standard validation process'}</p>
            <p><strong>After:</strong> {afterResult.explanation.reasoning?.join(', ') || 'Context-enhanced validation process'}</p>
            
            {beforeResult.agentTraces && afterResult.agentTraces && (
              <p className="text-xs text-gray-600 mt-3">
                Re-validation executed {afterResult.agentTraces.length} agents vs {beforeResult.agentTraces.length} in initial validation.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}