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
  const [filterStatus, setFilterStatus] = useState<'all' | 'ALLOW' | 'NEEDS_REVIEW' | 'REJECT'>('all')

  const toggleItemExpansion = (index: number) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedItems(newExpanded)
  }

  const filteredLines = result.lines.filter(line => 
    filterStatus === 'all' || line.status === filterStatus
  )

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
    <div className={`mt-8 space-y-6 overflow-visible ${className}`}>
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

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Filter by status:</span>
            <div className="flex space-x-2">
              {(['all', 'ALLOW', 'NEEDS_REVIEW', 'REJECT'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1 text-sm rounded-lg border ${
                    filterStatus === status
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {status === 'all' ? 'All' : 
                   status === 'ALLOW' ? '✅ Approved' :
                   status === 'NEEDS_REVIEW' ? '⚠️ Review' :
                   '❌ Rejected'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            Showing {filteredLines.length} of {result.lines.length} items
          </div>
        </div>
      </div>


      {/* Enhanced Line Items */}
      <div className="space-y-4">
        <h4 className="text-lg font-semibold text-gray-900">📋 Item-by-Item Analysis</h4>
        
        {filteredLines.map((line: EnhancedLineItemResult, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {/* Item Header - Always Visible */}
            <div 
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleItemExpansion(index)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button className="text-gray-400 hover:text-gray-600">
                    {expandedItems.has(index) ? '▼' : '▶'}
                  </button>
                  <div>
                    <h5 className="font-medium text-gray-900">
                      {line.type === 'labor' ? 
                        `Labor: ${line.input.quantity} hours` : 
                        line.input.name
                      }
                    </h5>
                    <div className="text-sm text-gray-500 mt-1">
                      {line.type !== 'labor' && 
                        `${line.input.quantity} × $${line.input.unitPrice} = $${(line.input.quantity * line.input.unitPrice).toFixed(2)}`
                      }
                      <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded capitalize">
                        {line.type}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className={`px-3 py-1 rounded-lg text-sm font-medium border ${getOverallStatusColor(line.status)}`}>
                      {getOverallStatusIcon(line.status)} {
                        line.status === 'ALLOW' ? 'Approved' : 
                        line.status === 'NEEDS_REVIEW' ? 'Needs Review' : 
                        'Rejected'
                      }
                    </div>
                    <div className="mt-1">
                      <ConfidenceExplainer 
                        confidenceScore={line.confidenceScore}
                        status={line.status}
                        itemName={line.input.name}
                        className="inline-block"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Quick Summary - Always Visible */}
              <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700">
                {line.explanation.summary}
              </div>
            </div>
            
            {/* Expanded Content */}
            {expandedItems.has(index) && (
              <div className="border-t border-gray-200">
                <ExplanationCard
                  itemName={line.input.name}
                  status={line.status}
                  explanation={line.explanation}
                  agentContributions={line.agentContributions}
                  decisionFactors={line.decisionFactors}
                  confidenceScore={line.confidenceScore}
                  className="border-0 rounded-none"
                />
              </div>
            )}
          </div>
        ))}
      </div>

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