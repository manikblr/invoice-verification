'use client'

import { useState, useRef, useEffect } from 'react'

interface TextExpandOnHoverProps {
  text: string
  maxLength?: number
  className?: string
  expandedClassName?: string
  showCopyButton?: boolean
}

export default function TextExpandOnHover({ 
  text, 
  maxLength = 100, 
  className = '', 
  expandedClassName = '',
  showCopyButton = false
}: TextExpandOnHoverProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const textRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const shouldTruncate = text.length > maxLength
  const displayText = shouldTruncate && !isExpanded 
    ? `${text.slice(0, maxLength)}...` 
    : text

  const calculateTooltipPosition = () => {
    if (!textRef.current || !tooltipRef.current) return

    const textRect = textRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const viewport = { width: window.innerWidth, height: window.innerHeight }

    let top = textRect.bottom + 8
    let left = textRect.left

    // Adjust if tooltip would go off right edge
    if (left + tooltipRect.width > viewport.width - 20) {
      left = viewport.width - tooltipRect.width - 20
    }

    // Adjust if tooltip would go off left edge
    if (left < 20) {
      left = 20
    }

    // Adjust if tooltip would go off bottom edge
    if (top + tooltipRect.height > viewport.height - 20) {
      top = textRect.top - tooltipRect.height - 8
    }

    // Adjust if tooltip would go off top edge
    if (top < 20) {
      top = 20
    }

    setTooltipPosition({ top, left })
  }

  const handleMouseEnter = () => {
    if (shouldTruncate) {
      setShowTooltip(true)
    }
  }

  const handleMouseLeave = () => {
    setShowTooltip(false)
    setIsExpanded(false)
  }

  const handleClick = () => {
    if (shouldTruncate) {
      setIsExpanded(!isExpanded)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  useEffect(() => {
    if (showTooltip) {
      calculateTooltipPosition()
    }
  }, [showTooltip])

  if (!shouldTruncate && !showCopyButton) {
    return <span className={className}>{text}</span>
  }

  return (
    <>
      <div
        ref={textRef}
        className={`relative inline-block ${shouldTruncate ? 'cursor-pointer' : ''} ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        title={shouldTruncate ? 'Click to expand, hover for full text' : undefined}
      >
        <span className={`${shouldTruncate ? 'hover:bg-yellow-100 hover:rounded px-1 transition-colors' : ''}`}>
          {displayText}
        </span>
        
        {shouldTruncate && (
          <span className="text-blue-500 ml-1 text-xs">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}

        {showCopyButton && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              copyToClipboard()
            }}
            className="ml-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-1 py-0.5 rounded transition-colors"
            title="Copy to clipboard"
          >
            📋
          </button>
        )}
      </div>

      {/* Tooltip for full text */}
      {showTooltip && shouldTruncate && (
        <>
          <div className="fixed inset-0 pointer-events-none z-40" />
          <div
            ref={tooltipRef}
            className={`fixed z-50 bg-gray-900 text-white text-sm rounded-lg shadow-xl border border-gray-700 max-w-md ${expandedClassName}`}
            style={{
              top: tooltipPosition.top,
              left: tooltipPosition.left,
            }}
          >
            <div className="p-3 space-y-2">
              <div className="text-xs font-medium text-gray-300 mb-2">Full Text:</div>
              <div className="text-xs text-gray-100 leading-relaxed max-h-40 overflow-y-auto">
                {text}
              </div>
              
              {showCopyButton && (
                <div className="border-t border-gray-700 pt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copyToClipboard()
                    }}
                    className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded transition-colors w-full"
                  >
                    📋 Copy Full Text
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}