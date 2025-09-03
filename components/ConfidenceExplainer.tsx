'use client'

import { useState } from 'react'

interface ConfidenceExplainerProps {
  confidenceScore: number
  status: 'ALLOW' | 'NEEDS_REVIEW' | 'REJECT'
  itemName?: string
  className?: string
}

export default function ConfidenceExplainer({ 
  confidenceScore, 
  status, 
  itemName,
  className = '' 
}: ConfidenceExplainerProps) {
  const [showDetails, setShowDetails] = useState(false)
  
  const confidencePercentage = Math.round(confidenceScore * 100)
  
  // Decision thresholds based on business rules
  const getThresholds = () => {
    return {
      approve: 90,
      needsReview: 70,
      reject: 30
    }
  }
  
  const thresholds = getThresholds()
  
  const getConfidenceLevel = (percentage: number): { level: string; color: string; description: string } => {
    if (percentage >= 90) {
      return {
        level: 'Very High',
        color: 'text-green-700 bg-green-100 border-green-300',
        description: 'Items with this confidence are typically auto-approved'
      }
    } else if (percentage >= 70) {
      return {
        level: 'High',
        color: 'text-blue-700 bg-blue-100 border-blue-300', 
        description: 'Strong match found, but may need additional context'
      }
    } else if (percentage >= 50) {
      return {
        level: 'Medium',
        color: 'text-amber-700 bg-amber-100 border-amber-300',
        description: 'Requires human review to make final decision'
      }
    } else {
      return {
        level: 'Low',
        color: 'text-red-700 bg-red-100 border-red-300',
        description: 'Likely to be rejected or needs significant clarification'
      }
    }
  }
  
  const confidenceInfo = getConfidenceLevel(confidencePercentage)
  
  const getDecisionExplanation = () => {
    switch (status) {
      case 'ALLOW':
        return `✅ This item was approved because its ${confidencePercentage}% confidence score exceeds our ${thresholds.approve}% approval threshold.`
      case 'NEEDS_REVIEW':
        return `⚠️ This item needs review because its ${confidencePercentage}% confidence score falls between ${thresholds.needsReview}% and ${thresholds.approve}%.`
      case 'REJECT':
        return `❌ This item was rejected because its ${confidencePercentage}% confidence score is below our ${thresholds.needsReview}% minimum threshold.`
    }
  }
  
  const getImprovementSuggestion = () => {
    const needed = thresholds.approve - confidencePercentage
    if (status === 'NEEDS_REVIEW' && needed > 0) {
      return `To auto-approve this item, we need ${needed} more confidence points. Try providing more specific details about "${itemName || 'this item'}".`
    }
    return null
  }
  
  return (
    <div className={`${className}`}>
      {/* Confidence Badge */}
      <div className="flex items-center space-x-2">
        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${confidenceInfo.color}`}>
          {confidencePercentage}% {confidenceInfo.level} Confidence
        </span>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          {showDetails ? 'Hide' : 'Why this score?'}
        </button>
      </div>
      
      {/* Detailed Explanation */}
      {showDetails && (
        <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          {/* Decision Explanation */}
          <div className="mb-3">
            <h5 className="font-medium text-gray-900 mb-2">Decision Logic</h5>
            <p className="text-sm text-gray-700">{getDecisionExplanation()}</p>
          </div>
          
          {/* Confidence Level Explanation */}
          <div className="mb-3">
            <h5 className="font-medium text-gray-900 mb-2">What This Confidence Means</h5>
            <p className="text-sm text-gray-700">{confidenceInfo.description}</p>
          </div>
          
          {/* Thresholds Visualization */}
          <div className="mb-3">
            <h5 className="font-medium text-gray-900 mb-2">Our Decision Thresholds</h5>
            <div className="relative">
              {/* Confidence Bar */}
              <div className="flex h-8 bg-gray-200 rounded-full overflow-hidden">
                <div className="bg-red-300 flex items-center justify-center text-xs font-medium text-red-800" 
                     style={{ width: `${thresholds.needsReview}%` }}>
                  &lt; {thresholds.needsReview}% Reject
                </div>
                <div className="bg-amber-300 flex items-center justify-center text-xs font-medium text-amber-800" 
                     style={{ width: `${thresholds.approve - thresholds.needsReview}%` }}>
                  {thresholds.needsReview}-{thresholds.approve}% Review
                </div>
                <div className="bg-green-300 flex items-center justify-center text-xs font-medium text-green-800" 
                     style={{ width: `${100 - thresholds.approve}%` }}>
                  {thresholds.approve}%+ Approve
                </div>
              </div>
              
              {/* Current Score Indicator */}
              <div 
                className="absolute top-0 h-full w-1 bg-black z-10"
                style={{ left: `${confidencePercentage}%`, transform: 'translateX(-50%)' }}
              >
                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs px-1 py-0.5 rounded">
                  {confidencePercentage}%
                </div>
              </div>
            </div>
          </div>
          
          {/* Improvement Suggestion */}
          {getImprovementSuggestion() && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded">
              <h5 className="font-medium text-blue-900 mb-1">💡 How to Improve</h5>
              <p className="text-sm text-blue-800">{getImprovementSuggestion()}</p>
            </div>
          )}
          
          {/* Technical Details */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <h5 className="font-medium text-gray-900 mb-2">How We Calculate Confidence</h5>
            <div className="text-xs text-gray-600 space-y-1">
              <p>• <strong>Item Matching:</strong> How well the item matches our catalog (40% weight)</p>
              <p>• <strong>Price Validation:</strong> Whether the price falls in expected ranges (30% weight)</p>
              <p>• <strong>Business Rules:</strong> Compliance with company policies (20% weight)</p>
              <p>• <strong>Content Quality:</strong> Completeness and clarity of description (10% weight)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}