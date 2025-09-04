'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getValidationDetails } from '@/lib/transparency-api'
import { ValidationTrace } from '@/lib/types/transparency'
import EnhancedLineItemsTable from '@/components/EnhancedLineItemsTable'
import Link from 'next/link'

export default function ValidationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.invoiceId as string
  
  const [validation, setValidation] = useState<ValidationTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (invoiceId) {
      loadValidationDetails()
    }
  }, [invoiceId])

  const loadValidationDetails = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const details = await getValidationDetails(invoiceId)
      setValidation(details)
      
    } catch (err) {
      console.error('Failed to load validation details:', err)
      setError('Failed to load validation details')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading validation details...</p>
        </div>
      </div>
    )
  }

  if (error || !validation) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center py-16">
          <div className="text-red-600 text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Validation Not Found</h2>
          <p className="text-gray-600 mb-6">
            {error || `No validation found for invoice ${invoiceId}`}
          </p>
          <div className="space-x-4">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Go Back
            </button>
            <Link
              href="/history"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              View All History
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Convert ValidationTrace to EnhancedValidationResponse format
  const enhancedResponse = {
    success: true,
    invoiceId: validation.session.invoiceId,
    traceId: validation.session.langfuseTraceId || 'legacy-trace',
    timestamp: validation.session.createdAt,
    totalExecutionTime: validation.session.totalExecutionTime || 0,
    overallStatus: validation.session.overallStatus,
    summary: validation.session.validationResults?.summary || {
      totalLines: validation.lineItems.length,
      allow: validation.lineItems.filter(item => item.validationDecision === 'ALLOW').length,
      needsReview: validation.lineItems.filter(item => item.validationDecision === 'NEEDS_REVIEW').length,
      reject: validation.lineItems.filter(item => item.validationDecision === 'REJECT').length
    },
    lines: validation.lineItems.map(item => ({
      // Standard fields
      type: item.itemType || 'material',
      input: {
        name: item.itemName,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || 0,
        unit: 'pcs',
        type: (item.itemType as 'material' | 'equipment' | 'labor') || 'material'
      },
      status: item.validationDecision,
      reasonCodes: ['historical_validation'],
      
      // Enhanced fields
      confidenceScore: item.confidenceScore || 0.5,
      explanation: {
        summary: `${item.validationDecision} - Historical validation result`,
        detailed: `This item was previously validated with decision: ${item.validationDecision}`,
        technical: `Validation performed at ${validation.session.createdAt}`,
        reasoning: ['Historical validation data'],
        confidence: item.confidenceScore || 0.5,
        primaryFactors: ['historical_validation'],
        riskFactors: item.riskFactors || []
      },
      agentContributions: [],
      decisionFactors: []
    })),
    executionSummary: {
      totalAgents: validation.agentExecutions.length,
      totalExecutionTime: validation.session.totalExecutionTime || 0,
      averageConfidence: 0.8,
      criticalPath: [],
      bottlenecks: [],
      errorCount: 0
    },
    agentTraces: validation.agentExecutions,
    explanations: []
  }

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
              href="/history"
              className="text-blue-600 hover:text-blue-800"
            >
              All History
            </Link>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Validation Details
              </h1>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <code className="bg-gray-100 px-2 py-1 rounded font-mono">
                  {validation.session.invoiceId}
                </code>
                <span>•</span>
                <span>{new Date(validation.session.createdAt).toLocaleString()}</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <span className={`px-4 py-2 rounded-lg text-sm font-medium border flex items-center gap-2 ${getStatusColor(validation.session.overallStatus)}`}>
                <span className="text-lg">{getStatusIcon(validation.session.overallStatus)}</span>
                <span className="font-semibold">{validation.session.overallStatus}</span>
              </span>
            </div>
          </div>
      </div>

      {/* Session Summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">📊 Session Summary</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {validation.session.invoiceData.items?.length || 0}
            </div>
            <div className="text-sm text-gray-600">Total Items</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {validation.agentExecutions.length}
            </div>
            <div className="text-sm text-gray-600">Agents Executed</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600 mb-1">
              {validation.session.totalExecutionTime 
                ? validation.session.totalExecutionTime < 1000 
                  ? `${validation.session.totalExecutionTime}ms`
                  : `${(validation.session.totalExecutionTime / 1000).toFixed(1)}s`
                : 'N/A'}
            </div>
            <div className="text-sm text-gray-600">Execution Time</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {validation.lineItems.length > 0 
                ? Math.round((validation.lineItems.reduce((sum, item) => sum + (item.confidenceScore || 0), 0) / validation.lineItems.length) * 100)
                : 0}%
            </div>
            <div className="text-sm text-gray-600">Avg Confidence</div>
          </div>
        </div>

        {/* Invoice Details */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-3">📋 Invoice Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Scope of Work:</span>
              <p className="mt-1 font-medium text-gray-900">
                {validation.session.invoiceData.scopeOfWork || 'Not specified'}
              </p>
            </div>
            <div>
              <span className="text-gray-600">Labor Hours:</span>
              <p className="mt-1 font-medium text-gray-900">
                {validation.session.invoiceData.laborHours || 0} hours
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex space-x-4">
          <Link
            href={`/history/${invoiceId}/trace`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center space-x-2"
          >
            <span>🔍</span>
            <span>View Agent Trace</span>
          </Link>
          <Link
            href={`/history/${invoiceId}/compare`}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center space-x-2"
          >
            <span>⚖️</span>
            <span>Compare Validation</span>
          </Link>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={async () => {
              try {
                const { exportValidationReport } = await import('@/lib/transparency-api')
                const blob = await exportValidationReport(validation.session.invoiceId, 'pdf')
                
                // Create download link
                const url = window.URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = `validation-${validation.session.invoiceId}.pdf`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                window.URL.revokeObjectURL(url)
              } catch (error) {
                console.error('Export failed:', error)
                alert('Export functionality is currently unavailable')
              }
            }}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center space-x-2"
          >
            <span>📄</span>
            <span>Export PDF</span>
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(validation.session.invoiceId)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center space-x-2"
          >
            <span>📋</span>
            <span>Copy ID</span>
          </button>
        </div>
      </div>

      {/* Detailed Results */}
      <EnhancedLineItemsTable result={enhancedResponse} />
      
      {/* Additional Metadata */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">🔗 Technical Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600 font-mono">
          <div>
            <span className="text-gray-500">Session ID:</span>
            <p className="mt-1 break-all">{validation.session.id}</p>
          </div>
          <div>
            <span className="text-gray-500">Trace ID:</span>
            <p className="mt-1 break-all">{validation.session.langfuseTraceId || 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}