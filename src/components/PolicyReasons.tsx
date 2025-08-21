/**
 * Collapsible panel for displaying policy decision reasons
 * Includes copy-to-clipboard functionality for all reasons
 */

'use client';

import { useState } from 'react';

interface PolicyReasonsProps {
  /** List of reason strings */
  reasons?: string[];
  /** Whether panel starts expanded */
  initiallyOpen?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Collapsible panel showing policy reasons with copy functionality
 * - Click to expand/collapse
 * - Copy all button copies reasons as numbered list
 * - Accessible with proper ARIA attributes
 */
export function PolicyReasons({ 
  reasons = [], 
  initiallyOpen = false, 
  className = '' 
}: PolicyReasonsProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  const handleCopyAll = async (): Promise<void> => {
    if (!navigator.clipboard) {
      console.warn('Clipboard API not available');
      return;
    }

    const text = reasons
      .map((reason, index) => `${index + 1}. ${reason}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      // Could show a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  if (reasons.length === 0) {
    return (
      <div className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        No reasons provided
      </div>
    );
  }

  return (
    <div className={`border rounded-md bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 ${className}`}>
      <button
        type="button"
        className="flex items-center justify-between w-full p-3 text-left text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="policy-reasons-content"
      >
        <span>
          Reasons ({reasons.length})
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          id="policy-reasons-content"
          className="px-3 pb-3"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Decision Reasons
            </h4>
            <button
              type="button"
              onClick={handleCopyAll}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 focus:outline-none focus:underline"
              title="Copy all reasons to clipboard"
            >
              Copy All
            </button>
          </div>
          
          <ul className="space-y-1">
            {reasons.map((reason, index) => (
              <li
                key={index}
                className="text-sm text-gray-700 dark:text-gray-300 flex items-start"
              >
                <span className="text-gray-400 dark:text-gray-500 mr-2 flex-shrink-0 mt-0.5">
                  {index + 1}.
                </span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}