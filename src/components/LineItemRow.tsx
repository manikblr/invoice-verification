/**
 * Per-line invoice item editor with human-in-the-loop actions
 * Combines item editing with decision display and feedback
 */

'use client';

import { useState } from 'react';
import type { LineDecision, PolicyCode } from '@/types/agent';
import { DecisionBadge } from './DecisionBadge';
import { PolicyReasons } from './PolicyReasons';
import { JudgeScoreBar } from './JudgeScoreBar';
import { TraceLink } from './TraceLink';
import { SuggestionDropdown } from './SuggestionDropdown';
import { FLAGS } from '@/config/flags';
import { toast } from './ui/Toast';

interface LineItemRowProps {
  /** Agent decision for this line */
  decision: LineDecision;
  /** Current editable item name */
  editableName: string;
  /** Handler for name changes */
  onNameChange: (value: string) => void;
  /** Handler for suggestion selection */
  onPickSuggestion: (suggestion: { id: string; name: string }) => void;
  /** Handler for human-in-the-loop actions */
  onHilAction: (action: 'APPROVE' | 'DENY' | 'REQUEST_INFO', note?: string) => Promise<void>;
  /** Optional vendor ID for suggestion boosting */
  vendorId?: string;
  /** Fetch suggestions function */
  fetchSuggestions: (query: string) => Promise<ReadonlyArray<{ id: string; name: string; score: number; reason?: string }>>;
}

/**
 * Complete line item editor with decision display and HIL actions
 * - Left: editable name with suggestions
 * - Middle: quantity, unit price, total (simple inputs)
 * - Right: decision info and HIL actions when needed
 */
export function LineItemRow({
  decision,
  editableName,
  onNameChange,
  onPickSuggestion,
  onHilAction,
  vendorId,
  fetchSuggestions
}: LineItemRowProps): JSX.Element {
  const [optimisticPolicy, setOptimisticPolicy] = useState<PolicyCode | null>(null);
  const [isSubmittingHil, setIsSubmittingHil] = useState(false);
  const [hilNote, setHilNote] = useState('');
  const [showHilActions, setShowHilActions] = useState(decision.policy !== 'ALLOW');

  // Use optimistic policy if available, otherwise use actual decision
  const displayPolicy = optimisticPolicy || decision.policy;

  const handleHilAction = async (action: 'APPROVE' | 'DENY' | 'REQUEST_INFO'): Promise<void> => {
    if (isSubmittingHil) return;

    setIsSubmittingHil(true);
    
    // Optimistic update
    const targetPolicy: PolicyCode = action === 'APPROVE' ? 'ALLOW' : action === 'DENY' ? 'DENY' : 'NEEDS_MORE_INFO';
    setOptimisticPolicy(targetPolicy);

    try {
      await onHilAction(action, hilNote || undefined);
      
      // Success - keep optimistic state and hide HIL actions
      setShowHilActions(false);
      setHilNote('');
      toast.success(`Line ${decision.lineId} ${action.toLowerCase()}ed successfully`);
      
    } catch (error) {
      // Revert optimistic update on failure
      setOptimisticPolicy(null);
      toast.error(`Failed to ${action.toLowerCase()} line: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmittingHil(false);
    }
  };

  const needsHilAction = showHilActions && displayPolicy !== 'ALLOW';

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4 bg-white dark:bg-gray-800">
      {/* Header with line ID and decision badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Line {decision.lineId}
          </span>
          <DecisionBadge policy={displayPolicy} />
          {optimisticPolicy && (
            <span className="text-xs text-blue-600 dark:text-blue-400">
              (pending)
            </span>
          )}
        </div>
        
        {FLAGS.ENABLE_TRACE_LINKS && (
          <TraceLink traceId={decision.traceId} />
        )}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Item details */}
        <div className="space-y-4">
          <div>
            <label htmlFor={`name-${decision.lineId}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Item Name
            </label>
            <SuggestionDropdown
              value={editableName}
              onChange={onNameChange}
              onPick={onPickSuggestion}
              fetchSuggestions={fetchSuggestions}
              placeholder="Type item name or search..."
              className="w-full"
            />
          </div>

          {/* Simple quantity/price inputs */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Qty
              </label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="1"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Unit Price
              </label>
              <input
                type="number"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="0.00"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Total
              </label>
              <input
                type="number"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700"
                placeholder="0.00"
                readOnly
              />
            </div>
          </div>

          {/* Canonical match info */}
          {decision.canonicalItemId && (
            <div className="text-sm text-green-600 dark:text-green-400">
              ✓ Matched: {decision.canonicalItemId}
            </div>
          )}

          {/* Price band info */}
          {decision.priceBand && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Price Range: ${decision.priceBand.min} - ${decision.priceBand.max}
            </div>
          )}
        </div>

        {/* Middle: Policy reasons */}
        <div>
          <PolicyReasons 
            reasons={decision.reasons}
            initiallyOpen={displayPolicy !== 'ALLOW'}
          />
        </div>

        {/* Right: Judge scores and HIL actions */}
        <div className="space-y-4">
          {FLAGS.ENABLE_JUDGE_SCORES && decision.judge && (
            <JudgeScoreBar judge={decision.judge} />
          )}

          {/* HIL Actions for non-ALLOW policies */}
          {needsHilAction && (
            <div className="border border-orange-200 dark:border-orange-800 rounded-lg p-4 bg-orange-50 dark:bg-orange-900/20">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Human Review Required
              </h4>
              
              <div className="space-y-3">
                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleHilAction('APPROVE')}
                    disabled={isSubmittingHil}
                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500"
                    aria-label="Approve this line item as-is"
                  >
                    Approve as-is
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => handleHilAction('DENY')}
                    disabled={isSubmittingHil}
                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                    aria-label="Deny this line item"
                  >
                    Deny
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => handleHilAction('REQUEST_INFO')}
                    disabled={isSubmittingHil}
                    className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-md hover:bg-yellow-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    aria-label="Request more information for this line item"
                  >
                    Request Info
                  </button>
                </div>

                {/* Optional note */}
                <div>
                  <label htmlFor={`note-${decision.lineId}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Note (optional)
                  </label>
                  <textarea
                    id={`note-${decision.lineId}`}
                    value={hilNote}
                    onChange={(e) => setHilNote(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="Optional notes for this decision..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Proposal count */}
          {FLAGS.SHOW_PROPOSAL_COUNTS && decision.proposals && decision.proposals.length > 0 && (
            <div className="text-sm text-blue-600 dark:text-blue-400">
              {decision.proposals.length} proposal(s) generated
            </div>
          )}
        </div>
      </div>
    </div>
  );
}