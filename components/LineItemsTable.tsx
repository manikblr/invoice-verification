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
      <div className="flex items-center gap-4 flex-wrap">
        <h3 className="text-xl font-semibold">
          {result.testName ? result.testName : 'Validation Result'}
        </h3>
        <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${getStatusColor(result.invoice_status)} flex items-center gap-1`}>
          <span>{getStatusIcon(result.invoice_status)}</span>
          {result.invoice_status}
        </span>
        <span className="text-sm text-gray-500">Mode: {result.mode}</span>
        {result.invoice_id && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">ID:</span>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
              {result.invoice_id.substring(0, 8)}...
            </code>
            <button
              onClick={() => copyToClipboard(result.invoice_id!)}
              className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
              title="Copy full invoice ID"
            >
              Copy
            </button>
          </div>
        )}
        {result.save_warning && (
          <div className="text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
            ⚠ {result.save_warning}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4 p-4 bg-gray-100 rounded-lg text-sm">
        <div>Total Lines: <span className="font-semibold">{result.summary.total_lines}</span></div>
        <div>Allow: <span className="font-semibold text-green-600">{result.summary.allow}</span></div>
        <div>Review: <span className="font-semibold text-yellow-600">{result.summary.needs_review}</span></div>
        <div>Reject: <span className="font-semibold text-red-600">{result.summary.reject}</span></div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-900">Type</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-900">Item</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-900">Status</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-900">Reason Codes</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-900">Match</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-900">Pricing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {result.lines.map((line, index) => (
              <tr key={index}>
                <td className="px-4 py-2 text-sm text-gray-900 capitalize">{line.type}</td>
                <td className="px-4 py-2 text-sm text-gray-900">
                  {line.type === 'labor' ? 
                    `${line.input.hours} hours` : 
                    `${line.input.name} (${line.input.quantity} × $${line.input.unit_price})`
                  }
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(line.status)} flex items-center gap-1 w-fit`}>
                    <span>{getStatusIcon(line.status)}</span>
                    {line.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {line.reason_codes.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {line.reason_codes.map((code, codeIndex) => (
                        <span
                          key={codeIndex}
                          className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded border"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-2 text-sm text-gray-600">
                  {line.match ? 
                    `${line.match.canonical} (${Math.round(line.match.confidence * 100)}%)` : 
                    '-'
                  }
                </td>
                <td className="px-4 py-2 text-sm text-gray-600">
                  {line.pricing && line.pricing.min && line.pricing.max ? 
                    `$${line.pricing.min}-$${line.pricing.max}` : 
                    '-'
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}