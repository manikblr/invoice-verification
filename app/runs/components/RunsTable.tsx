'use client';

import { useState } from 'react';
import { PUBLIC_CFG } from '@/config/public';

interface AgentRun {
  id: string;
  invoice_id: string;
  created_at: string;
  stage: string;
  payload: {
    vendor_id?: string;
    line_count?: number;
    trace_id?: string;
    avg_policy_score?: number;
    avg_price_check_score?: number;
    avg_explanation_score?: number;
  };
}

interface RunsTableProps {
  initialRuns: AgentRun[];
}

function formatScore(score?: number): string {
  if (typeof score !== 'number') return 'N/A';
  return `${Math.round(score * 100)}%`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getLangfuseUrl(traceId: string): string {
  const baseUrl = PUBLIC_CFG.langfuseUrl;
  if (!baseUrl) return '#';
  return `${baseUrl}/trace/${traceId}`;
}

export default function RunsTable({ initialRuns }: RunsTableProps) {
  const [runs, setRuns] = useState(initialRuns);
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Filter runs based on current filters
  const filteredRuns = runs.filter(run => {
    const vendorMatch = !vendorFilter || 
      (run.payload.vendor_id?.toLowerCase().includes(vendorFilter.toLowerCase()));
    
    const dateMatch = (!dateFrom || run.created_at >= dateFrom) &&
      (!dateTo || run.created_at <= dateTo + 'T23:59:59');
    
    return vendorMatch && dateMatch;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-gray-50 p-4 rounded-lg border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendor ID
            </label>
            <input
              type="text"
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              placeholder="Filter by vendor..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-600">
        Showing {filteredRuns.length} of {runs.length} runs
      </div>

      {/* Table */}
      {filteredRuns.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-gray-500 mb-2">No runs match your filters</div>
          <div className="text-sm text-gray-400">
            Try adjusting your search criteria
          </div>
        </div>
      ) : (
        <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Run Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lines
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Judge Scores
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRuns.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(run.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-mono text-gray-900">
                      {run.invoice_id.slice(0, 8)}...
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {run.payload.vendor_id?.slice(0, 12) || 'Unknown'}...
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {run.payload.line_count || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-xs space-y-1">
                      <div>Policy: {formatScore(run.payload.avg_policy_score)}</div>
                      <div>Price: {formatScore(run.payload.avg_price_check_score)}</div>
                      <div>Explain: {formatScore(run.payload.avg_explanation_score)}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap space-x-2">
                    {run.payload.trace_id ? (
                      <a
                        href={getLangfuseUrl(run.payload.trace_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200"
                      >
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Trace
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400" title="Tracing disabled">—</span>
                    )}
                    <a
                      href={`/api/agent_run_crew?runId=${run.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200"
                    >
                      JSON
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}