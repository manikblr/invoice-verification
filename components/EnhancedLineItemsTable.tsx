'use client'

import { useState } from 'react'
import { EnhancedValidationResponse, EnhancedLineItemResult } from '@/lib/types/transparency'
import ExplanationCard from './ExplanationCard'
import AgentPipelineVisualization from './AgentPipelineVisualization'
import ConfidenceExplainer from './ConfidenceExplainer'

interface EnhancedLineItemsTableProps {
  result: EnhancedValidationResponse
  className?: string
}

export default function EnhancedLineItemsTable({ 
  result, 
  className = '' 
}: EnhancedLineItemsTableProps) {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())

  const toggleItemExpansion = (index: number) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedItems(newExpanded)
  }


  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case 'ALLOW':
        return 'text-green-700 bg-green-100 border-green-200'
      case 'NEEDS_REVIEW':
        return 'text-amber-700 bg-amber-100 border-amber-200'
      case 'REJECT':
        return 'text-red-700 bg-red-100 border-red-200'
      default:
        return 'text-gray-700 bg-gray-100 border-gray-200'
    }
  }

  const getOverallStatusIcon = (status: string) => {
    switch (status) {
      case 'ALLOW': return '✅'
      case 'NEEDS_REVIEW': return '⚠️'
      case 'REJECT': return '❌'
      default: return '❓'
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }


  return (
    <div className={`mt-8 space-y-6 ${className}`} style={{overflow: 'visible', position: 'relative', zIndex: 1}}>
      {/* Enhanced Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
              <span>🔍</span>
              <span>Enhanced Validation Results</span>
            </h3>
            <p className="text-gray-600 mt-1">
              Complete transparency into your validation with AI agent explanations
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <span className={`px-4 py-2 rounded-lg text-sm font-medium border flex items-center gap-2 ${getOverallStatusColor(result.overallStatus)}`}>
              <span className="text-lg">{getOverallStatusIcon(result.overallStatus)}</span>
              <span className="font-semibold">
                {result.overallStatus === 'ALLOW' ? 'All Items Approved' : 
                 result.overallStatus === 'NEEDS_REVIEW' ? 'Review Required' : 
                 result.overallStatus === 'REJECT' ? 'Items Rejected' : result.overallStatus}
              </span>
            </span>
            
            {result.invoiceId && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>ID:</span>
                <code className="bg-gray-100 px-2 py-1 rounded font-mono text-xs">
                  {result.invoiceId.substring(0, 12)}...
                </code>
                <button
                  onClick={() => copyToClipboard(result.invoiceId)}
                  className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
                  title="Copy full invoice ID"
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="text-sm text-gray-600 flex items-center space-x-4">
          <span>🕒 {result.totalExecutionTime}ms execution time</span>
          <span>🤖 {result.executionSummary.totalAgents} agents executed</span>
          <span>📊 {Math.round(result.executionSummary.averageConfidence * 100)}% avg confidence</span>
          <span>🎯 {result.traceId.substring(0, 8)}... trace ID</span>
        </div>
      </div>


      {/* Detailed Agent Pipeline Visualization */}
      {result.agentTraces && (
        <AgentPipelineVisualization
          agentExecutions={result.agentTraces}
          executionSummary={result.executionSummary}
        />
      )}




      {/* Footer Information */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600">
            Validation completed at {new Date(result.timestamp).toLocaleString()}
          </div>
          <div className="flex items-center space-x-4 text-gray-500">
            <span>🔗 Trace ID: {result.traceId.substring(0, 12)}...</span>
            <button 
              onClick={() => copyToClipboard(result.traceId)}
              className="text-blue-600 hover:text-blue-800"
            >
              Copy Full ID
            </button>
          </div>
        </div>
        
        <div className="mt-2 text-xs text-gray-500">
          This validation used {result.executionSummary.totalAgents} AI agents with an average confidence of {Math.round(result.executionSummary.averageConfidence * 100)}%. 
          All decisions are fully traceable and explainable.
        </div>
      </div>
    </div>
  )
}