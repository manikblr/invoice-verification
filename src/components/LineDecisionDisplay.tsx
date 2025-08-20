/**
 * Example composite component showing how to use all the invoice verification components
 * This demonstrates integration of all the individual components
 */

import { DecisionBadge } from './DecisionBadge';
import { PolicyReasons } from './PolicyReasons';
import { JudgeScoreBar } from './JudgeScoreBar';
import { TraceLink } from './TraceLink';
import { SuggestionDropdown } from './SuggestionDropdown';
import { suggestItems } from '@/lib/api';
import type { LineDecision } from '@/types/agent';

interface LineDecisionDisplayProps {
  /** Line decision data from agent */
  decision: LineDecision;
  /** Current item name for editing */
  itemName: string;
  /** Handler for item name changes */
  onItemNameChange: (name: string) => void;
  /** Handler for item selection from suggestions */
  onItemPick: (item: { id: string; name: string }) => void;
  /** Optional vendor ID for suggestion boosting */
  vendorId?: string;
}

/**
 * Complete display component for a line decision
 * Combines all the individual components into a cohesive UI
 */
export function LineDecisionDisplay({
  decision,
  itemName,
  onItemNameChange,
  onItemPick,
  vendorId
}: LineDecisionDisplayProps): JSX.Element {
  // Create fetchSuggestions function for SuggestionDropdown
  const fetchSuggestions = async (query: string) => {
    const suggestions = await suggestItems(query, vendorId);
    return suggestions.map(s => ({
      id: s.id,
      name: s.name,
      score: s.score,
      reason: s.reason
    }));
  };

  return (
    <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
      {/* Header with decision badge and trace link */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <DecisionBadge policy={decision.policy} />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Line {decision.lineId}
          </span>
        </div>
        
        <TraceLink traceId={decision.traceId} />
      </div>

      {/* Item name editor with suggestions */}
      <div className="space-y-2">
        <label htmlFor={`item-${decision.lineId}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Item Name
        </label>
        <SuggestionDropdown
          value={itemName}
          onChange={onItemNameChange}
          onPick={onItemPick}
          fetchSuggestions={fetchSuggestions}
          placeholder="Type item name or search..."
          className="w-full"
        />
      </div>

      {/* Price band info if available */}
      {decision.priceBand && (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Price Range: ${decision.priceBand.min} - ${decision.priceBand.max}
        </div>
      )}

      {/* Policy reasons */}
      <PolicyReasons 
        reasons={decision.reasons}
        initiallyOpen={decision.policy !== 'ALLOW'}
      />

      {/* Judge scores if available */}
      {decision.judge && (
        <JudgeScoreBar judge={decision.judge} />
      )}

      {/* Canonical item match if found */}
      {decision.canonicalItemId && (
        <div className="text-sm text-green-600 dark:text-green-400">
          ✓ Matched canonical item: {decision.canonicalItemId}
        </div>
      )}

      {/* Proposals count if any */}
      {decision.proposals && decision.proposals.length > 0 && (
        <div className="text-sm text-blue-600 dark:text-blue-400">
          Generated {decision.proposals.length} proposal(s) for human review
        </div>
      )}
    </div>
  );
}