'use client'

import { useState } from 'react'

interface InlineInfoRequestProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (explanation: string) => void
  itemName: string
  itemDescription?: string
  isSubmitting?: boolean
}

/**
 * Inline popup modal for requesting additional information about invoice items
 * Appears next to items that need clarification from agents
 */
export function InlineInfoRequest({
  isOpen,
  onClose,
  onSubmit,
  itemName,
  itemDescription,
  isSubmitting = false
}: InlineInfoRequestProps) {
  const [explanation, setExplanation] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!explanation.trim() || isSubmitting) return
    
    onSubmit(explanation.trim())
    setExplanation('') // Clear after submission
  }

  const handleClose = () => {
    setExplanation('') // Clear on close
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Additional Information Needed
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Item info */}
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {itemName}
              </div>
              {itemDescription && (
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {itemDescription}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label 
                  htmlFor="explanation"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Please provide additional context about this item:
                </label>
                <textarea
                  id="explanation"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  rows={4}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
                  placeholder="Explain why this item is needed, how it relates to your project, any special circumstances, etc."
                  required
                  minLength={10}
                  maxLength={1000}
                  disabled={isSubmitting}
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {explanation.length}/1000 characters (minimum 10)
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || explanation.trim().length < 10}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Info icon button that triggers the inline info request modal
 */
interface InfoIconProps {
  onClick: () => void
  needsInfo: boolean
  className?: string
}

export function InfoIcon({ onClick, needsInfo, className = '' }: InfoIconProps) {
  if (!needsInfo) return null

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center w-5 h-5 text-orange-600 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-full ${className}`}
      aria-label="Request additional information"
      title="This item needs additional information"
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    </button>
  )
}