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
          Enter your invoice details below and validate them to see which items will be approved, denied, or need additional explanation.
        </p>
      </div>
      
      <UnifiedInvoiceForm />
    </main>
  )
}