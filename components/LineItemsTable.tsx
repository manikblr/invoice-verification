import { ValidationResponse } from '../lib/types'

interface LineItemsTableProps {
  result: ValidationResponse
}

export default function LineItemsTable({ result }: LineItemsTableProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ALLOW':
        return 'text-green-700 bg-green-100'
      case 'NEEDS_REVIEW':
        return 'text-yellow-700 bg-yellow-100'
      case 'REJECT':
        return 'text-red-700 bg-red-100'
      default:
        return 'text-gray-700 bg-gray-100'
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center gap-4">
        <h3 className="text-xl font-semibold">Validation Result</h3>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(result.invoice_status)}`}>
          {result.invoice_status}
        </span>
        <span className="text-sm text-gray-500">Mode: {result.mode}</span>
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
                    `${line.input.name} (${line.input.quantity} × ₹${line.input.unit_price})`
                  }
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(line.status)}`}>
                    {line.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm text-gray-600">
                  {line.reason_codes.length > 0 ? line.reason_codes.join(', ') : '-'}
                </td>
                <td className="px-4 py-2 text-sm text-gray-600">
                  {line.match ? 
                    `${line.match.canonical} (${Math.round(line.match.confidence * 100)}%)` : 
                    '-'
                  }
                </td>
                <td className="px-4 py-2 text-sm text-gray-600">
                  {line.pricing && line.pricing.min && line.pricing.max ? 
                    `₹${line.pricing.min}-₹${line.pricing.max}` : 
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