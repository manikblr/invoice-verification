'use client'

import { useState, useEffect } from 'react'
import { getValidationHistory, searchValidationHistory } from '@/lib/transparency-api'
import { ValidationHistoryResponse, ValidationSessionSummary } from '@/lib/types/transparency'
import Link from 'next/link'

export default function ValidationHistoryPage() {
  const [history, setHistory] = useState<ValidationSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ALLOW' | 'NEEDS_REVIEW' | 'REJECT'>('all')
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    end: new Date().toISOString().split('T')[0] // today
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const itemsPerPage = 20

  useEffect(() => {
    loadHistory()
  }, [statusFilter, dateRange, currentPage])

  const loadHistory = async () => {
    try {
      setLoading(true)
      setError(null)

      const query = {
        status: statusFilter === 'all' ? undefined : statusFilter,
        startDate: dateRange.start,
        endDate: dateRange.end,
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
        sortBy: 'date' as const,
        sortOrder: 'desc' as const
      }

      const response = await getValidationHistory(query)
      setHistory(response.sessions)
      setTotalPages(Math.ceil(response.total / itemsPerPage))
      
    } catch (err) {
      console.error('Failed to load validation history:', err)
      setError('Failed to load validation history')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadHistory()
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await searchValidationHistory(searchQuery, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        dateRange: { start: dateRange.start, end: dateRange.end }
      })

      setHistory(response.sessions)
      setTotalPages(Math.ceil(response.total / itemsPerPage))
      setCurrentPage(1)
      
    } catch (err) {
      console.error('Search failed:', err)
      setError('Search failed')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ALLOW': return 'bg-green-100 text-green-800 border-green-200'
      case 'NEEDS_REVIEW': return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'REJECT': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
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

  const formatExecutionTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Validation History</h1>
        <p className="text-gray-600">
          Track and analyze your invoice validation history with complete transparency
        </p>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search by item name or description
            </label>
            <div className="flex">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Search validation history..."
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                🔍 Search
              </button>
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="ALLOW">✅ Approved</option>
              <option value="NEEDS_REVIEW">⚠️ Needs Review</option>
              <option value="REJECT">❌ Rejected</option>
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date Range
            </label>
            <div className="space-y-1">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-full px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-full px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            {searchQuery && (
              <span>
                Search results for "<strong>{searchQuery}</strong>" • {history.length} results
              </span>
            )}
            {!searchQuery && (
              <span>
                Showing {history.length} validation sessions
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setSearchQuery('')
              setStatusFilter('all')
              setCurrentPage(1)
              loadHistory()
            }}
            className="text-blue-600 hover:text-blue-800"
          >
            Clear all filters
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {loading && (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading validation history...</p>
          </div>
        )}

        {error && (
          <div className="p-8 text-center">
            <div className="text-red-600 mb-2">❌ Error</div>
            <p className="text-gray-600">{error}</p>
            <button
              onClick={loadHistory}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <div className="p-8 text-center">
            <div className="text-gray-400 text-6xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No validation history found</h3>
            <p className="text-gray-600 mb-4">
              {searchQuery 
                ? `No results found for "${searchQuery}". Try adjusting your search or filters.`
                : "Start validating invoices to see your history here."}
            </p>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Validate New Invoice
            </Link>
          </div>
        )}

        {!loading && !error && history.length > 0 && (
          <>
            {/* History Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice & Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Items & Results
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Execution Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date & Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                                {session.invoiceId.substring(0, 12)}...
                              </code>
                              <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(session.overallStatus)}`}>
                                {getStatusIcon(session.overallStatus)} {session.overallStatus}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 truncate max-w-xs">
                              {session.invoiceData.scopeOfWork || 'No description'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <div className="font-medium text-gray-900 mb-1">
                            {session.invoiceData.items?.length || 0} items
                          </div>
                          <div className="text-gray-600 space-x-4">
                            {session.validationResults && (
                              <>
                                <span className="text-green-600">✅ {session.validationResults.summary?.allow || 0}</span>
                                <span className="text-amber-600">⚠️ {session.validationResults.summary?.needsReview || 0}</span>
                                <span className="text-red-600">❌ {session.validationResults.summary?.reject || 0}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600">
                          <div className="mb-1">
                            🕒 {session.totalExecutionTime ? formatExecutionTime(session.totalExecutionTime) : 'N/A'}
                          </div>
                          <div className="text-xs">
                            🤖 {0} agents
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600 mb-2">
                          {new Date(session.createdAt).toLocaleDateString()} at {new Date(session.createdAt).toLocaleTimeString()}
                        </div>
                        <div className="space-x-2">
                          <Link
                            href={`/history/${session.invoiceId}`}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            View Details
                          </Link>
                          <Link
                            href={`/history/${session.invoiceId}/trace`}
                            className="text-gray-600 hover:text-gray-800 text-sm"
                          >
                            Agent Trace
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}