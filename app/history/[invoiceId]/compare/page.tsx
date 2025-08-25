'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getValidationDetails, compareValidations } from '@/lib/transparency-api'
import { ValidationTrace } from '@/lib/types/transparency'
import Link from 'next/link'

export default function ValidationComparePage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId1 = params.invoiceId as string
  
  const [validation1, setValidation1] = useState<ValidationTrace | null>(null)
  const [validation2, setValidation2] = useState<ValidationTrace | null>(null)
  const [invoiceId2, setInvoiceId2] = useState('')
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [comparison, setComparison] = useState<any>(null)
  const [recentValidations, setRecentValidations] = useState<string[]>([])

  useEffect(() => {
    if (invoiceId1) {
      loadValidation1()
      loadRecentValidations()
    }
  }, [invoiceId1])

  const loadValidation1 = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const details = await getValidationDetails(invoiceId1)
      setValidation1(details)
      
    } catch (err) {
      console.error('Failed to load validation 1:', err)
      setError('Failed to load validation details')
    } finally {
      setLoading(false)
    }
  }

  const loadRecentValidations = async () => {
    // This would load recent validation IDs for quick selection
    // For now, we'll use mock data
    setRecentValidations([
      'inv_1756094805612_mr8x4yxuz',
      'inv_1756094851488_xyixzepvj', 
      'inv_1756094916371_iekvlrwsq'
    ])
  }

  const handleCompare = async () => {
    if (!invoiceId2.trim()) {
      setError('Please enter a second invoice ID to compare')
      return
    }

    try {
      setComparing(true)
      setError(null)
      
      // Load validation 2
      const details2 = await getValidationDetails(invoiceId2.trim())
      setValidation2(details2)
      
      // Perform comparison
      const comparisonResult = await compareValidations(invoiceId1, invoiceId2.trim())
      setComparison(comparisonResult)
      
    } catch (err) {
      console.error('Comparison failed:', err)
      setError(`Failed to compare validations: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setValidation2(null)
      setComparison(null)
    } finally {
      setComparing(false)
    }
  }

  const clearComparison = () => {
    setValidation2(null)
    setComparison(null)
    setInvoiceId2('')
    setError(null)
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

  const formatDuration = (ms: number) => {
    if (!ms) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading validation for comparison...</p>
        </div>
      </div>
    )
  }

  if (error && !validation1) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center py-16">
          <div className="text-red-600 text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Comparison Failed</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-x-4">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
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
            href={`/history/${invoiceId1}`}
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
              ⚖️ Validation Comparison
            </h1>
            <p className="text-gray-600">
              Compare validation results to analyze differences and improvements
            </p>
          </div>
        </div>
      </div>

      {/* Comparison Setup */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Compare Validations</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Validation 1 (Fixed) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Base Validation (Current)
            </label>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <code className="text-sm font-mono">{invoiceId1}</code>
                  <div className="text-xs text-gray-600 mt-1">
                    {validation1 && new Date(validation1.session.createdAt).toLocaleString()}
                  </div>
                </div>
                {validation1 && (
                  <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(validation1.session.overallStatus)}`}>
                    {getStatusIcon(validation1.session.overallStatus)} {validation1.session.overallStatus}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Validation 2 (Selectable) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Compare Against
            </label>
            <div className="space-y-3">
              <div className="flex">
                <input
                  type="text"
                  value={invoiceId2}
                  onChange={(e) => setInvoiceId2(e.target.value)}
                  placeholder="Enter invoice ID to compare..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleCompare}
                  disabled={comparing || !invoiceId2.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {comparing ? '⏳' : '⚖️'} Compare
                </button>
              </div>
              
              {recentValidations.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Or select from recent:</p>
                  <div className="flex flex-wrap gap-1">
                    {recentValidations.map(id => (
                      <button
                        key={id}
                        onClick={() => setInvoiceId2(id)}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        {id.substring(0, 16)}...
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {validation2 && (
          <div className="mt-4 flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded">
            <div className="flex items-center space-x-3">
              <span className="text-green-600">✅</span>
              <span className="text-sm text-green-700">
                Comparison ready between <strong>{invoiceId1.substring(0, 12)}...</strong> and <strong>{invoiceId2.substring(0, 12)}...</strong>
              </span>
            </div>
            <button
              onClick={clearComparison}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Comparison Results */}
      {comparison && validation1 && validation2 && (
        <>
          {/* Summary Comparison */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Summary Comparison</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700">Overall Status</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Validation 1:</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(validation1.session.overallStatus)}`}>
                      {getStatusIcon(validation1.session.overallStatus)} {validation1.session.overallStatus}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Validation 2:</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(validation2.session.overallStatus)}`}>
                      {getStatusIcon(validation2.session.overallStatus)} {validation2.session.overallStatus}
                    </span>
                  </div>
                  {validation1.session.overallStatus !== validation2.session.overallStatus && (
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                      ⚠️ Status changed from {validation1.session.overallStatus} to {validation2.session.overallStatus}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700">Execution Time</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Validation 1:</span>
                    <span className="text-sm font-medium">{formatDuration(validation1.session.totalExecutionTime || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Validation 2:</span>
                    <span className="text-sm font-medium">{formatDuration(validation2.session.totalExecutionTime || 0)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {comparison.differences.executionTimeChange && (
                      <div className={`p-2 rounded ${
                        comparison.differences.executionTimeChange.to < comparison.differences.executionTimeChange.from
                          ? 'bg-green-50 text-green-600' 
                          : 'bg-red-50 text-red-600'
                      }`}>
                        {comparison.differences.executionTimeChange.to < comparison.differences.executionTimeChange.from ? '🚀 Faster' : '⏳ Slower'} by {Math.abs(comparison.differences.executionTimeChange.to - comparison.differences.executionTimeChange.from)}ms
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700">Agent Count</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Validation 1:</span>
                    <span className="text-sm font-medium">{validation1.agentExecutions.length} agents</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Validation 2:</span>
                    <span className="text-sm font-medium">{validation2.agentExecutions.length} agents</span>
                  </div>
                  {comparison.differences.agentDifferences.length > 0 && (
                    <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                      🔄 {comparison.differences.agentDifferences.length} agent changes
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Status Changes */}
          {comparison.differences.statusChanges.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">🔄 Status Changes</h3>
              
              <div className="space-y-3">
                {comparison.differences.statusChanges.map((change: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded">
                    <div>
                      <span className="font-medium text-gray-900">{change.item}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(change.from)}`}>
                        {getStatusIcon(change.from)} {change.from}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(change.to)}`}>
                        {getStatusIcon(change.to)} {change.to}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confidence Changes */}
          {comparison.differences.confidenceChanges.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Confidence Changes</h3>
              
              <div className="space-y-3">
                {comparison.differences.confidenceChanges.map((change: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded">
                    <div>
                      <span className="font-medium text-gray-900">{change.item}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium">{Math.round(change.from * 100)}%</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-sm font-medium">{Math.round(change.to * 100)}%</span>
                      <span className={`text-xs ${
                        change.to > change.from ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {change.to > change.from ? '↗' : '↘'} {Math.round(Math.abs(change.to - change.from) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent Differences */}
          {comparison.differences.agentDifferences.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">🤖 Agent Differences</h3>
              
              <div className="space-y-3">
                {comparison.differences.agentDifferences.map((diff: any, index: number) => (
                  <div key={index} className={`p-3 rounded border ${
                    diff.change === 'added' 
                      ? 'bg-green-50 border-green-200 text-green-700' 
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}>
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">
                        {diff.change === 'added' ? '➕' : '➖'}
                      </span>
                      <span className="font-medium">{diff.agent}</span>
                      <span className="text-sm">
                        was {diff.change === 'added' ? 'added to' : 'removed from'} the pipeline
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Changes */}
          {comparison.differences.statusChanges.length === 0 && 
           comparison.differences.confidenceChanges.length === 0 && 
           comparison.differences.agentDifferences.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <div className="text-gray-400 text-6xl mb-4">🔍</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Significant Differences Found</h3>
              <p className="text-gray-600">
                Both validations produced very similar results with no major changes in status, confidence, or agent execution.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}