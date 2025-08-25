import Link from 'next/link'

export default function AdminPage() {
  const adminSections = [
    {
      title: 'Pipeline Demo',
      description: 'Advanced validation-first workflow with real-time status tracking',
      href: '/pipeline',
      color: 'bg-green-50 border-green-200 hover:bg-green-100',
      icon: '🚀'
    },
    {
      title: 'Verification',
      description: 'Agent-based invoice review and human-in-the-loop validation',
      href: '/verify', 
      color: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
      icon: '🔍'
    },
    {
      title: 'Agent Runs',
      description: 'Historical data and observability for agent performance monitoring',
      href: '/runs',
      color: 'bg-purple-50 border-purple-200 hover:bg-purple-100', 
      icon: '📊'
    }
  ]

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Admin Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Monitor user interactions, agent performance, and access advanced features.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className={`block p-6 border-2 rounded-lg transition-colors ${section.color}`}
          >
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">{section.icon}</span>
              <h3 className="text-lg font-semibold text-gray-900">
                {section.title}
              </h3>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              {section.description}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-12 bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          System Information
        </h2>
        
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            <span className="text-gray-600">Langfuse Integration Active</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            <span className="text-gray-600">Service Context Rules Enabled</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            <span className="text-gray-600">Status Pipeline Active</span>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Quick Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-2xl font-bold text-blue-600">411</div>
              <div className="text-gray-600">Service Types</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">20</div>
              <div className="text-gray-600">Service Lines</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">v2.1</div>
              <div className="text-gray-600">Pipeline Version</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">Live</div>
              <div className="text-gray-600">System Status</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}