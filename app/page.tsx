import Link from 'next/link'
import UnifiedInvoiceForm from '../components/UnifiedInvoiceForm'

export default function Home() {
  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Invoice Verification System
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Enter materials and equipment in a single unified interface. The system will automatically categorize and validate your items using intelligent agents.
        </p>
        <div className="flex space-x-4">
          <Link 
            href="/pipeline" 
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            🚀 NEW: Validation Pipeline Demo
          </Link>
        </div>
      </div>
      
      <UnifiedInvoiceForm />
    </main>
  )
}