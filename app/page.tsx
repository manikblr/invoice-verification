import Link from 'next/link'
import InvoiceForm from '../components/InvoiceForm'

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Invoice Verification System
        </h1>
        <div className="flex space-x-4">
          <Link 
            href="/verify" 
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Go to Verification
          </Link>
        </div>
      </div>
      
      <InvoiceForm />
    </main>
  )
}