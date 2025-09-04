'use client'

import React, { Component, ReactNode } from 'react'
import Link from 'next/link'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

export default class ValidationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ValidationErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error,
      errorInfo
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="text-center py-16">
            <div className="text-red-600 text-6xl mb-4">💥</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-6">
              An unexpected error occurred while loading the validation details.
            </p>
            
            {this.state.error && (
              <div className="mb-6 text-left bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl mx-auto">
                <h3 className="text-sm font-medium text-red-800 mb-2">Error Details:</h3>
                <code className="text-xs text-red-700 break-all">
                  {this.state.error.message}
                </code>
              </div>
            )}
            
            <div className="space-x-4">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: undefined, errorInfo: undefined })
                  window.location.reload()
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Try Again
              </button>
              <Link
                href="/history"
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Back to History
              </Link>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}