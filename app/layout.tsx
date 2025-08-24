import type { Metadata } from 'next'
import './globals.css'
import Navigation from '../components/Navigation'

export const metadata: Metadata = {
  title: 'Invoice Verification Pipeline',
  description: 'Validation-first invoice processing with real-time status tracking',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <Navigation />
        {children}
      </body>
    </html>
  )
}