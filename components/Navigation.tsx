'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Navigation() {
  const pathname = usePathname()
  
  const navItems = [
    { href: '/', label: 'Home', description: 'Main invoice form' },
    { href: '/history', label: 'History', description: 'Validation history and transparency' },
    { href: '/admin', label: 'Admin', description: 'Admin dashboard and monitoring' },
  ]
  
  return (
    <nav className="bg-white border-b border-gray-200 mb-6">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-1">
            <span className="text-xl font-bold text-gray-900">Invoice Verification</span>
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
              v2.1 Pipeline
            </span>
          </div>
          
          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive 
                      ? 'bg-blue-100 text-blue-900 border border-blue-200' 
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                    }
                  `}
                  title={item.description}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
          
          <div className="text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <span>✅ Langfuse Integration</span>
              <span>✅ Service Context Rules</span>
              <span>✅ Status Pipeline</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}