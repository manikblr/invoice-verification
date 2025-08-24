'use client'

import { useState, useEffect } from 'react'

interface StatusChipsProps {
  status: string
  stageDetails?: any
  lineItemId?: string
  onExplainNeeded?: (lineItemId: string) => void
}

export default function StatusChips({ 
  status, 
  stageDetails, 
  lineItemId,
  onExplainNeeded 
}: StatusChipsProps) {
  
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'NEW':
        return {
          text: 'New',
          color: 'bg-gray-100 text-gray-800 border-gray-300',
          icon: '⏳',
          pulse: false
        }
      case 'VALIDATION_REJECTED':
        return {
          text: 'Rejected',
          color: 'bg-red-100 text-red-800 border-red-300',
          icon: '❌',
          pulse: false
        }
      case 'AWAITING_MATCH':
        return {
          text: 'Validating',
          color: 'bg-blue-100 text-blue-800 border-blue-300',
          icon: '🔍',
          pulse: true
        }
      case 'AWAITING_INGEST':
        return {
          text: 'Searching',
          color: 'bg-purple-100 text-purple-800 border-purple-300',
          icon: '🌐',
          pulse: true
        }
      case 'MATCHED':
        return {
          text: 'Matched',
          color: 'bg-green-100 text-green-800 border-green-300',
          icon: '✅',
          pulse: false
        }
      case 'PRICE_VALIDATED':
        return {
          text: 'Price OK',
          color: 'bg-green-100 text-green-800 border-green-300',
          icon: '💰',
          pulse: false
        }
      case 'NEEDS_EXPLANATION':
        return {
          text: 'Needs Explanation',
          color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
          icon: '❓',
          pulse: false
        }
      case 'READY_FOR_SUBMISSION':
        return {
          text: 'Ready',
          color: 'bg-green-100 text-green-800 border-green-300',
          icon: '🎉',
          pulse: false
        }
      case 'DENIED':
        return {
          text: 'Denied',
          color: 'bg-red-100 text-red-800 border-red-300',
          icon: '🚫',
          pulse: false
        }
      default:
        return {
          text: 'Unknown',
          color: 'bg-gray-100 text-gray-800 border-gray-300',
          icon: '❓',
          pulse: false
        }
    }
  }

  const config = getStatusConfig(status)
  
  const handleExplainClick = () => {
    if (lineItemId && onExplainNeeded) {
      onExplainNeeded(lineItemId)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Main Status Chip */}
      <span 
        className={`
          inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border 
          ${config.color}
          ${config.pulse ? 'animate-pulse' : ''}
        `}
      >
        <span className="mr-1">{config.icon}</span>
        {config.text}
      </span>

      {/* Stage Details */}
      {stageDetails?.validation && (
        <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">
          📋 Validated ({stageDetails.validation.score?.toFixed(2)})
        </span>
      )}

      {stageDetails?.matching?.canonicalItemId && (
        <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-green-50 text-green-700 border border-green-200">
          🔗 Matched ({(stageDetails.matching.confidence * 100)?.toFixed(0)}%)
        </span>
      )}

      {stageDetails?.pricing?.validated && (
        <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-green-50 text-green-700 border border-green-200">
          💵 Price OK
        </span>
      )}

      {stageDetails?.explanation?.required && (
        <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-yellow-50 text-yellow-700 border border-yellow-200">
          💬 Explanation {stageDetails.explanation.submitted ? 'Submitted' : 'Required'}
        </span>
      )}

      {/* Explain Button for NEEDS_EXPLANATION status */}
      {status === 'NEEDS_EXPLANATION' && (
        <button
          onClick={handleExplainClick}
          className="inline-flex items-center px-3 py-1 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600 transition-colors"
        >
          <span className="mr-1">✏️</span>
          Explain
        </button>
      )}

      {/* Still Processing Indicator */}
      {(status === 'AWAITING_MATCH' || status === 'AWAITING_INGEST') && (
        <span className="text-xs text-gray-500">Still checking...</span>
      )}
    </div>
  )
}