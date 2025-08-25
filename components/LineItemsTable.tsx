import { ValidationResponse } from '../lib/types'
import TypeaheadInput from './TypeaheadInput'
import CurrencyInput from './CurrencyInput'

interface LineItemsTableProps {
  result: ValidationResponse
}

export default function LineItemsTable({ result }: LineItemsTableProps) {
  const getStatusColor = (status: string) => {
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ALLOW':
        return '✓'
      case 'NEEDS_REVIEW':
        return '⚠'
      case 'REJECT':
        return '✗'
      default:
        return '?'
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
    <div className="mt-8 space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold text-gray-900">
            🔍 Validation Results
          </h3>
          <span className={`px-4 py-2 rounded-lg text-sm font-medium border ${getStatusColor(result.invoice_status)} flex items-center gap-2`}>
            <span className="text-lg">{getStatusIcon(result.invoice_status)}</span>
            <span className="font-semibold">
              {result.invoice_status === 'ALLOW' ? 'All Items Approved' : 
               result.invoice_status === 'NEEDS_REVIEW' ? 'Review Required' : 
               result.invoice_status === 'REJECT' ? 'Items Rejected' : result.invoice_status}
            </span>
          </span>
        </div>
        
        <p className="text-gray-600 mb-4">
          {result.invoice_status === 'ALLOW' ? 
            'Great! All your items have been validated and approved.' :
            result.invoice_status === 'NEEDS_REVIEW' ?
            'Some items need additional review or explanation before approval.' :
            'Some items cannot be approved. Please review the reasons below.'
          }
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">📊 Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 mb-1">{result.summary.allow}</div>
            <div className="text-sm text-gray-600">✅ Approved</div>
            <div className="text-xs text-gray-500">Ready to proceed</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-amber-600 mb-1">{result.summary.needs_review}</div>
            <div className="text-sm text-gray-600">⚠️ Needs Review</div>
            <div className="text-xs text-gray-500">Requires explanation</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600 mb-1">{result.summary.reject}</div>
            <div className="text-sm text-gray-600">❌ Rejected</div>
            <div className="text-xs text-gray-500">Cannot be approved</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-600 mb-1">{result.summary.total_lines}</div>
            <div className="text-sm text-gray-600">📝 Total Items</div>
            <div className="text-xs text-gray-500">Items validated</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h4 className="text-lg font-semibold text-gray-900">📋 Detailed Results</h4>
          <p className="text-sm text-gray-600 mt-1">Review each item's validation status and reasons</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Item Details</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Explanation</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">System Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {result.lines.map((line, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="font-medium text-gray-900">
                        {line.type === 'labor' ? 
                          `Labor: ${line.input.hours} hours` : 
                          line.input.name
                        }
                      </div>
                      <div className="text-sm text-gray-500">
                        {line.type !== 'labor' && 
                          `${line.input.quantity} × $${line.input.unit_price} = $${(line.input.quantity * line.input.unit_price).toFixed(2)}`
                        }
                        <span className="ml-2 capitalize text-xs bg-gray-100 px-2 py-1 rounded">
                          {line.type}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-2 rounded-lg text-sm font-medium border ${getStatusColor(line.status)} flex items-center gap-2 w-fit`}>
                      <span className="text-base">{getStatusIcon(line.status)}</span>
                      <span>
                        {line.status === 'ALLOW' ? 'Approved' : 
                         line.status === 'NEEDS_REVIEW' ? 'Needs Review' : 
                         line.status === 'REJECT' ? 'Rejected' : line.status}
                      </span>
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {line.reason_codes.length > 0 ? (
                      <div className="space-y-1">
                        {line.reason_codes.map((code, codeIndex) => (
                          <div
                            key={codeIndex}
                            className="text-sm text-gray-700"
                          >
                            • {code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-green-600">✓ No issues found</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      {line.match ? (
                        <div>
                          <div className="font-medium text-gray-900">{line.match.canonical}</div>
                          <div className="text-gray-500">
                            {Math.round(line.match.confidence * 100)}% confidence
                            {line.pricing && line.pricing.min && line.pricing.max && (
                              <div className="text-xs mt-1">Market: ${line.pricing.min}-${line.pricing.max}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">No system match</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}