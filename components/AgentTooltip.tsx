'use client'

import { useState, useRef, useEffect } from 'react'
import { AgentExecution } from '@/lib/types/transparency'

interface AgentTooltipProps {
  agentName: string
  agentExecution?: AgentExecution
  children: React.ReactNode
  className?: string
}

interface TooltipPosition {
  top: number
  left: number
  placement: 'top' | 'bottom' | 'left' | 'right'
}

export default function AgentTooltip({ 
  agentName, 
  agentExecution, 
  children, 
  className = '' 
}: AgentTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const agentDescriptions: Record<string, any> = {
    'Item Matcher Agent': {
      purpose: 'Matches invoice line items to canonical catalog items using hybrid search algorithms',
      description: 'Uses exact matching, synonym matching, and fuzzy string matching with RapidFuzz to find the best catalog matches.',
      tools: ['RapidFuzz matching', 'Canonical item database', 'Synonym cache'],
      dataSources: ['canonical-items', 'item-synonyms', 'product-catalog'],
      stage: 'validation',
      icon: '🎯'
    },
    'Price Learner Agent': {
      purpose: 'Validates unit prices against expected ranges and learns from pricing patterns',
      description: 'Analyzes pricing data with 20% variance thresholds and creates adjustment proposals for out-of-band prices.',
      tools: ['Price range validation', 'Statistical analysis', 'Market data comparison'],
      dataSources: ['pricing-data', 'market-prices', 'historical-costs'],
      stage: 'pricing',
      icon: '💰'
    },
    'Rule Applier Agent': {
      purpose: 'Applies deterministic business rules to determine line item approval status',
      description: 'Processes 7+ business rules including canonical matching, price validation, vendor exclusions, and quantity limits.',
      tools: ['Rule engine', 'Policy evaluation', 'Decision matrix'],
      dataSources: ['business-rules', 'vendor-policies', 'compliance-data'],
      stage: 'compliance',
      icon: '📋'
    },
    'Item Validator Agent': {
      purpose: 'Validates user submissions for inappropriate content and abuse detection',
      description: 'LLM-powered content classification to detect spam, profanity, and inappropriate facility management items.',
      tools: ['LLM classification', 'Content filtering', 'Abuse detection'],
      dataSources: ['content-policies', 'classification-models', 'facility-categories'],
      stage: 'validation',
      icon: '✅'
    },
    'CrewAI Agent Pipeline': {
      purpose: 'Orchestrates the complete multi-agent validation workflow',
      description: 'Coordinates all specialized agents in sequence to provide comprehensive invoice validation.',
      tools: ['Agent orchestration', 'Workflow management', 'Result aggregation'],
      dataSources: ['all-agent-outputs', 'pipeline-config', 'execution-metrics'],
      stage: 'orchestration',
      icon: '🤖'
    }
  }

  const agentInfo = agentDescriptions[agentName] || {
    purpose: 'Specialized processing agent',
    description: 'Performs specific validation or processing tasks within the invoice verification pipeline.',
    tools: ['Custom processing tools'],
    dataSources: ['agent-specific-data'],
    stage: 'processing',
    icon: '⚙️'
  }

  const calculatePosition = (): TooltipPosition => {
    if (!triggerRef.current || !tooltipRef.current) {
      return { top: 0, left: 0, placement: 'top' }
    }

    const trigger = triggerRef.current.getBoundingClientRect()
    const tooltip = tooltipRef.current.getBoundingClientRect()
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    }

    // Try different placements to avoid viewport overflow
    const placements = [
      {
        name: 'top' as const,
        top: trigger.top - tooltip.height - 8,
        left: trigger.left + (trigger.width - tooltip.width) / 2
      },
      {
        name: 'bottom' as const,
        top: trigger.bottom + 8,
        left: trigger.left + (trigger.width - tooltip.width) / 2
      },
      {
        name: 'left' as const,
        top: trigger.top + (trigger.height - tooltip.height) / 2,
        left: trigger.left - tooltip.width - 8
      },
      {
        name: 'right' as const,
        top: trigger.top + (trigger.height - tooltip.height) / 2,
        left: trigger.right + 8
      }
    ]

    // Find the first placement that doesn't overflow
    for (const placement of placements) {
      const wouldOverflow = 
        placement.left < 0 ||
        placement.top < 0 ||
        placement.left + tooltip.width > viewport.width ||
        placement.top + tooltip.height > viewport.height

      if (!wouldOverflow) {
        return {
          top: placement.top,
          left: placement.left,
          placement: placement.name
        }
      }
    }

    // Fallback to top placement with adjustments
    return {
      top: Math.max(8, trigger.top - tooltip.height - 8),
      left: Math.max(8, Math.min(viewport.width - tooltip.width - 8, trigger.left + (trigger.width - tooltip.width) / 2)),
      placement: 'top'
    }
  }

  const handleMouseEnter = () => {
    setIsVisible(true)
  }

  const handleMouseLeave = () => {
    setIsVisible(false)
  }

  useEffect(() => {
    if (isVisible && tooltipRef.current) {
      const pos = calculatePosition()
      setPosition(pos)
    }
  }, [isVisible])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <>
      <div
        ref={triggerRef}
        className={`relative inline-block ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>

      {isVisible && position && (
        <>
          {/* Backdrop to prevent flickering */}
          <div className="fixed inset-0 pointer-events-none z-40" />
          
          {/* Tooltip */}
          <div
            ref={tooltipRef}
            className="fixed z-50 bg-gray-900 text-white text-sm rounded-lg shadow-xl border border-gray-700 max-w-sm"
            style={{
              top: position.top,
              left: position.left,
            }}
          >
            {/* Tooltip Arrow */}
            <div 
              className={`absolute w-2 h-2 bg-gray-900 border-l border-t border-gray-700 transform rotate-45 ${
                position.placement === 'top' ? 'bottom-[-4px] left-1/2 -translate-x-1/2' :
                position.placement === 'bottom' ? 'top-[-4px] left-1/2 -translate-x-1/2' :
                position.placement === 'left' ? 'right-[-4px] top-1/2 -translate-y-1/2' :
                'left-[-4px] top-1/2 -translate-y-1/2'
              }`}
            />

            <div className="p-4 space-y-3">
              {/* Agent Header */}
              <div className="flex items-center space-x-2">
                <span className="text-xl">{agentInfo.icon}</span>
                <div>
                  <div className="font-semibold text-white">{agentName}</div>
                  <div className="text-xs text-gray-400 capitalize">{agentInfo.stage} stage</div>
                </div>
              </div>

              {/* Purpose */}
              <div>
                <div className="text-xs font-medium text-gray-300 mb-1">Purpose:</div>
                <div className="text-xs text-gray-100">{agentInfo.purpose}</div>
              </div>

              {/* Description */}
              <div>
                <div className="text-xs font-medium text-gray-300 mb-1">Description:</div>
                <div className="text-xs text-gray-100">{agentInfo.description}</div>
              </div>

              {/* Execution Details (if available) */}
              {agentExecution && (
                <div className="border-t border-gray-700 pt-2 space-y-2">
                  <div className="text-xs font-medium text-gray-300">Execution Details:</div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400">Status:</span>
                      <span className={`ml-1 ${
                        agentExecution.status === 'SUCCESS' ? 'text-green-400' :
                        agentExecution.status === 'FAILED' ? 'text-red-400' :
                        'text-yellow-400'
                      }`}>
                        {agentExecution.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Time:</span>
                      <span className="text-gray-100 ml-1">{agentExecution.executionTime}ms</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Confidence:</span>
                      <span className="text-gray-100 ml-1">
                        {agentExecution.confidenceScore ? `${Math.round(agentExecution.confidenceScore * 100)}%` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Version:</span>
                      <span className="text-gray-100 ml-1">{agentExecution.agentVersion}</span>
                    </div>
                  </div>

                  {agentExecution.decisionRationale && (
                    <div>
                      <div className="text-xs font-medium text-gray-300 mb-1">Decision:</div>
                      <div className="text-xs text-gray-100 bg-gray-800 rounded px-2 py-1">
                        {agentExecution.decisionRationale}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tools Used */}
              <div>
                <div className="text-xs font-medium text-gray-300 mb-1">Tools Used:</div>
                <div className="flex flex-wrap gap-1">
                  {(agentExecution?.toolsUsed || agentInfo.tools).map((tool: string, index: number) => (
                    <span 
                      key={index}
                      className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              {/* Data Sources */}
              <div>
                <div className="text-xs font-medium text-gray-300 mb-1">Data Sources:</div>
                <div className="flex flex-wrap gap-1">
                  {(agentExecution?.dataSourcesAccessed || agentInfo.dataSources).map((source: string, index: number) => (
                    <span 
                      key={index}
                      className="text-xs bg-green-900 text-green-200 px-2 py-1 rounded"
                    >
                      {source}
                    </span>
                  ))}
                </div>
              </div>

              {/* Copy Agent Info Button */}
              <div className="border-t border-gray-700 pt-2">
                <button
                  onClick={() => copyToClipboard(`${agentName}: ${agentInfo.purpose}\n\nDescription: ${agentInfo.description}\n\nTools: ${agentInfo.tools.join(', ')}\nData Sources: ${agentInfo.dataSources.join(', ')}`)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded transition-colors w-full"
                >
                  📋 Copy Agent Info
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}