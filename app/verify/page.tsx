/**
 * Invoice verification page with agent pipeline and human-in-the-loop
 * Loads invoice data, runs agent verification, and provides per-line editing
 */

'use client';

import { useState, useMemo } from 'react';
import type { LineDecision, AgentRunResponse } from '@/types/agent';
import { runAgent, suggestItems } from '@/lib/api';
import { sendFeedback } from '@/lib/feedback';
import { LineItemRow } from '@/components/LineItemRow';
import { ToastContainer, toast } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FLAGS } from '@/config/flags';

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceData {
  invoiceId: string;
  vendorId: string;
  lines: InvoiceLine[];
}

/**
 * Main verification page component
 */
export default function VerifyPage(): JSX.Element {
  // Mock initial invoice data (in real app, would come from query params or API)
  const [invoice] = useState<InvoiceData>({
    invoiceId: 'inv_123',
    vendorId: 'vendor_abc',
    lines: [
      {
        id: 'line_001',
        description: 'Office Chair Ergonomic',
        quantity: 2,
        unitPrice: 299.99
      },
      {
        id: 'line_002', 
        description: 'Wireless Mouse Optical',
        quantity: 5,
        unitPrice: 25.50
      },
      {
        id: 'line_003',
        description: 'Copy Paper A4 500 sheets',
        quantity: 10,
        unitPrice: 8.99
      }
    ]
  });

  // State management
  const [decisions, setDecisions] = useState<Record<string, LineDecision>>({});
  const [editableNames, setEditableNames] = useState<Record<string, string>>(
    Object.fromEntries(invoice.lines.map(line => [line.id, line.description]))
  );
  const [dirtyLines, setDirtyLines] = useState<Set<string>>(new Set());
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [hasRunAgent, setHasRunAgent] = useState(false);

  // Summary statistics
  const summary = useMemo(() => {
    const decisionList = Object.values(decisions);
    const counts = {
      ALLOW: decisionList.filter(d => d.policy === 'ALLOW').length,
      DENY: decisionList.filter(d => d.policy === 'DENY').length,
      NEEDS_MORE_INFO: decisionList.filter(d => d.policy === 'NEEDS_MORE_INFO').length,
      total: decisionList.length
    };

    const judgeScores = FLAGS.ENABLE_JUDGE_SCORES 
      ? decisionList
          .filter(d => d.judge)
          .map(d => d.judge!)
      : [];

    const avgScores = judgeScores.length > 0 ? {
      avgPolicyScore: judgeScores.reduce((sum, j) => sum + j.policyScore, 0) / judgeScores.length,
      avgPriceCheckScore: judgeScores.reduce((sum, j) => sum + j.priceCheckScore, 0) / judgeScores.length,
      avgExplanationScore: judgeScores.reduce((sum, j) => sum + j.explanationScore, 0) / judgeScores.length
    } : null;

    return { counts, avgScores };
  }, [decisions]);

  // Run agent verification
  const handleRunAgent = async (): Promise<void> => {
    if (isRunningAgent) return;

    setIsRunningAgent(true);
    
    try {
      const agentPayload = {
        invoiceId: invoice.invoiceId,
        vendorId: invoice.vendorId,
        lines: invoice.lines.map(line => ({
          id: line.id,
          description: editableNames[line.id] || line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice
        }))
      };

      const response: AgentRunResponse = await runAgent(agentPayload);
      
      // Merge decisions by lineId
      const newDecisions: Record<string, LineDecision> = {};
      response.decisions.forEach(decision => {
        newDecisions[decision.lineId] = decision;
      });
      
      setDecisions(newDecisions);
      setHasRunAgent(true);
      setDirtyLines(new Set()); // Clear dirty state after successful run
      
      toast.success(`Verified ${response.decisions.length} line items`);
      
    } catch (error) {
      toast.error(`Agent verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunningAgent(false);
    }
  };

  // Handle name changes
  const handleNameChange = (lineId: string, name: string): void => {
    setEditableNames(prev => ({ ...prev, [lineId]: name }));
    setDirtyLines(prev => {
      const newSet = new Set(prev);
      newSet.add(lineId);
      return newSet;
    });
  };

  // Handle suggestion selection
  const handlePickSuggestion = (lineId: string, suggestion: { id: string; name: string }): void => {
    setEditableNames(prev => ({ ...prev, [lineId]: suggestion.name }));
    setDirtyLines(prev => {
      const newSet = new Set(prev);
      newSet.add(lineId);
      return newSet;
    });
  };

  // Handle HIL feedback
  const handleHilAction = async (
    lineId: string, 
    action: 'APPROVE' | 'DENY' | 'REQUEST_INFO', 
    note?: string
  ): Promise<void> => {
    const decision = decisions[lineId];
    if (!decision) throw new Error('No decision found for line');

    await sendFeedback({
      lineId,
      action,
      note,
      proposals: decision.proposals
    });
  };

  // Create fetch suggestions function
  const createFetchSuggestions = (lineId: string) => async (query: string) => {
    const suggestions = await suggestItems(query, invoice.vendorId);
    return suggestions.map(s => ({
      id: s.id,
      name: s.name,
      score: s.score,
      reason: s.reason
    }));
  };

  const hasDirtyLines = dirtyLines.size > 0;
  const showRerunButton = hasRunAgent && hasDirtyLines;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Invoice Verification
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Invoice {invoice.invoiceId} from {invoice.vendorId}
          </p>
        </div>

        {/* Summary */}
        {hasRunAgent && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-8 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Verification Summary
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {summary.counts.ALLOW}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Allowed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {summary.counts.DENY}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Denied</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {summary.counts.NEEDS_MORE_INFO}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Needs Info</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {summary.counts.total}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Lines</div>
              </div>
            </div>

            {/* Judge scores summary */}
            {FLAGS.ENABLE_JUDGE_SCORES && summary.avgScores && (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Avg Policy Score:</span>
                  <span className="ml-2 font-medium">{Math.round(summary.avgScores.avgPolicyScore * 100)}%</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Avg Price Score:</span>
                  <span className="ml-2 font-medium">{Math.round(summary.avgScores.avgPriceCheckScore * 100)}%</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Avg Explanation:</span>
                  <span className="ml-2 font-medium">{Math.round(summary.avgScores.avgExplanationScore * 100)}%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex space-x-4 mb-8">
          <button
            type="button"
            onClick={handleRunAgent}
            disabled={isRunningAgent}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {isRunningAgent ? 'Running Verification...' : hasRunAgent ? 'Run Verification' : 'Start Verification'}
          </button>

          {showRerunButton && (
            <button
              type="button"
              onClick={handleRunAgent}
              disabled={isRunningAgent}
              className="px-6 py-3 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              Re-run ({dirtyLines.size} modified)
            </button>
          )}
        </div>

        {/* Line items */}
        <ErrorBoundary>
          <div className="space-y-6">
            {invoice.lines.map(line => (
              <LineItemRow
              key={line.id}
              decision={decisions[line.id] || {
                lineId: line.id,
                policy: 'NEEDS_MORE_INFO',
                reasons: ['Pending verification'],
                proposals: [],
              }}
              editableName={editableNames[line.id] || line.description}
              onNameChange={(name) => handleNameChange(line.id, name)}
              onPickSuggestion={(suggestion) => handlePickSuggestion(line.id, suggestion)}
              onHilAction={(action, note) => handleHilAction(line.id, action, note)}
              vendorId={invoice.vendorId}
              fetchSuggestions={createFetchSuggestions(line.id)}
            />
          ))}
          </div>
        </ErrorBoundary>

        {/* Empty state */}
        {!hasRunAgent && (
          <div className="text-center py-12">
            <div className="text-gray-400 dark:text-gray-600 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
              Ready to verify invoice
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Click "Start Verification" to begin the agent review process
            </p>
          </div>
        )}
      </div>

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}