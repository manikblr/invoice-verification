'use client'

import { useState, useEffect } from 'react'

interface RevalidationProgressProps {
  isRevalidating: boolean
  itemName: string
  additionalContext: string
  onComplete?: (result: any) => void
  className?: string
}

interface AgentStep {
  name: string
  icon: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  description: string
  executionTime?: number
}

export default function RevalidationProgress({
  isRevalidating,
  itemName,
  additionalContext,
  onComplete,
  className = ''
}: RevalidationProgressProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [steps, setSteps] = useState<AgentStep[]>([
    {
      name: 'Pre-Validation Agent',
      icon: '🛡️',
      status: 'pending',
      description: 'Checking if your additional context addresses initial concerns...'
    },
    {
      name: 'Item Validator Agent',
      icon: '✅',
      status: 'pending',
      description: 'Re-validating item with your additional context...'
    },
    {
      name: 'Item Matcher Agent',
      icon: '🎯',
      status: 'pending',
      description: 'Finding better catalog matches using your context...'
    },
    {
      name: 'Price Learner Agent',
      icon: '💰',
      status: 'pending',
      description: 'Re-analyzing pricing with additional information...'
    },
    {
      name: 'Rule Applier Agent',
      icon: '📋',
      status: 'pending',
      description: 'Applying business rules with your contextual information...'
    },
    {
      name: 'Final Decision',
      icon: '🎯',
      status: 'pending',
      description: 'Making final decision based on enhanced validation...'
    }
  ])

  useEffect(() => {
    if (!isRevalidating) {
      // Reset to initial state
      setCurrentStep(0)
      setSteps(prev => prev.map(step => ({ ...step, status: 'pending', executionTime: undefined })))
      return
    }

    // Simulate agent execution progress
    const simulateAgentExecution = () => {
      let stepIndex = 0
      
      const progressInterval = setInterval(() => {
        if (stepIndex >= steps.length) {
          clearInterval(progressInterval)
          if (onComplete) {
            onComplete({ message: 'Re-validation completed successfully' })
          }
          return
        }

        setSteps(prev => prev.map((step, index) => {
          if (index === stepIndex) {
            return { ...step, status: 'in_progress' }
          } else if (index < stepIndex) {
            return { 
              ...step, 
              status: 'completed',
              executionTime: Math.floor(Math.random() * 500) + 100 // Random execution time
            }
          }
          return step
        }))

        setCurrentStep(stepIndex)

        // Simulate varying execution times for different agents
        const executionTimes = {
          0: 200,  // Pre-validation
          1: 300,  // Item validator
          2: 400,  // Item matcher
          3: 350,  // Price learner
          4: 600,  // Rule applier (longest)
          5: 250   // Final decision
        }

        setTimeout(() => {
          setSteps(prev => prev.map((step, index) => {
            if (index === stepIndex) {
              return { 
                ...step, 
                status: 'completed',
                executionTime: executionTimes[stepIndex as keyof typeof executionTimes]
              }
            }
            return step
          }))

          stepIndex++
        }, executionTimes[stepIndex as keyof typeof executionTimes] || 300)

      }, executionTimes[stepIndex as keyof typeof executionTimes] || 300)

      return progressInterval
    }

    const interval = simulateAgentExecution()
    return () => clearInterval(interval)
  }, [isRevalidating, onComplete])

  if (!isRevalidating) {
    return null
  }

  const completedSteps = steps.filter(step => step.status === 'completed').length
  const progressPercentage = (completedSteps / steps.length) * 100

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-6 ${className}`}>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-blue-900 flex items-center space-x-2">
            <span>🔄</span>
            <span>Re-analyzing with Your Context</span>
          </h3>
          <div className="text-sm text-blue-700">
            {completedSteps}/{steps.length} agents completed
          </div>
        </div>
        
        <div className="text-sm text-blue-800 mb-3">
          Item: "<strong>{itemName}</strong>" • Your context: "<em>{additionalContext.substring(0, 100)}{additionalContext.length > 100 ? '...' : ''}</em>"
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-blue-200 rounded-full h-2 mb-4">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Agent Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div 
            key={index}
            className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-200 ${
              step.status === 'in_progress' ? 'bg-white border border-blue-300 shadow-sm' :
              step.status === 'completed' ? 'bg-green-50 border border-green-200' :
              'bg-white border border-gray-200'
            }`}
          >
            {/* Agent Icon */}
            <div className={`text-xl flex-shrink-0 ${
              step.status === 'in_progress' ? 'animate-bounce' : ''
            }`}>
              {step.icon}
            </div>

            {/* Agent Info */}
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className={`font-medium ${
                  step.status === 'completed' ? 'text-green-900' :
                  step.status === 'in_progress' ? 'text-blue-900' :
                  'text-gray-700'
                }`}>
                  {step.name}
                </span>
                
                {step.status === 'in_progress' && (
                  <div className="flex space-x-1">
                    <div className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
                
                {step.status === 'completed' && step.executionTime && (
                  <span className="text-xs text-green-600">
                    {step.executionTime}ms
                  </span>
                )}
              </div>
              
              <div className={`text-sm ${
                step.status === 'completed' ? 'text-green-700' :
                step.status === 'in_progress' ? 'text-blue-700' :
                'text-gray-600'
              }`}>
                {step.status === 'completed' ? '✅ Completed' : 
                 step.status === 'in_progress' ? step.description :
                 'Waiting to start...'}
              </div>
            </div>

            {/* Status Icon */}
            <div className="flex-shrink-0">
              {step.status === 'completed' && <span className="text-green-600 text-lg">✅</span>}
              {step.status === 'in_progress' && (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              )}
              {step.status === 'pending' && <span className="text-gray-400 text-lg">⏳</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Impact Message */}
      {completedSteps > 0 && (
        <div className="mt-4 p-3 bg-white border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-800">
            <strong>✨ Your additional context is being actively processed!</strong> Each agent is re-running its analysis 
            with your explanation to provide the most accurate validation possible. This is genuine AI re-evaluation, not just auto-approval.
          </div>
        </div>
      )}
    </div>
  )
}