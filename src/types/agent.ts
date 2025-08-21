/**
 * Agent decision types and validation schemas
 * Used for /api/agent_run_crew responses and related data structures
 */

import { z } from 'zod';

/**
 * Policy decision codes returned by the rules engine
 */
export type PolicyCode = 'ALLOW' | 'DENY' | 'NEEDS_MORE_INFO';

/**
 * Judge evaluation scores for agent decisions
 * All scores are normalized to 0..1 range
 */
export interface JudgeScores {
  /** Policy compliance score (0=non-compliant, 1=fully compliant) */
  policyScore: number;
  /** Price validation score (0=invalid, 1=valid) */
  priceCheckScore: number;
  /** Explanation quality score (0=poor, 1=excellent) */
  explanationScore: number;
}

/**
 * Price range band for canonical items
 */
export interface PriceBand {
  /** Minimum acceptable price */
  min: number;
  /** Maximum acceptable price */
  max: number;
}

/**
 * Agent proposal for human review
 */
export interface Proposal {
  /** Type of proposal requiring human approval */
  type: 'NEW_SYNONYM' | 'PRICE_RANGE_ADJUST' | 'NEW_RULE' | 'NEW_CANONICAL';
  /** Agent confidence in this proposal (0..1) */
  confidence: number;
  /** Proposal-specific data payload */
  payload: Record<string, unknown>;
}

/**
 * Decision result for a single invoice line item
 */
export interface LineDecision {
  /** Unique identifier for this line item */
  lineId: string;
  /** Policy decision from rules engine */
  policy: PolicyCode;
  /** Human-readable reasons for the decision */
  reasons: string[];
  /** Matched canonical item ID, if found */
  canonicalItemId?: string | null;
  /** Price validation range, if applicable */
  priceBand?: PriceBand | null;
  /** Judge evaluation scores, if enabled */
  judge?: JudgeScores;
  /** Langfuse trace ID for observability */
  traceId?: string;
  /** Agent proposals generated during processing */
  proposals?: Proposal[];
}

/**
 * Complete response from agent crew run
 */
export interface AgentRunResponse {
  /** Decision results for each line item */
  decisions: LineDecision[];
  /** Unique identifier for this agent run */
  runId: string;
  /** Aggregate judge scores across all decisions */
  judgeSummary?: {
    /** Average policy compliance score */
    avgPolicyScore: number;
    /** Average price validation score */
    avgPriceCheckScore: number;
    /** Average explanation quality score */
    avgExplanationScore: number;
  };
}

// Zod validation schemas
// Keep in same file to prevent drift between types and validators

/**
 * Runtime validation schema for PolicyCode
 */
export const ZPolicyCode = z.enum(['ALLOW', 'DENY', 'NEEDS_MORE_INFO']);

/**
 * Runtime validation schema for JudgeScores
 */
export const ZJudgeScores = z.object({
  policyScore: z.number().min(0).max(1),
  priceCheckScore: z.number().min(0).max(1),
  explanationScore: z.number().min(0).max(1),
});

/**
 * Runtime validation schema for PriceBand
 */
export const ZPriceBand = z.object({
  min: z.number().min(0),
  max: z.number().min(0),
});

/**
 * Runtime validation schema for Proposal
 */
export const ZProposal = z.object({
  type: z.enum(['NEW_SYNONYM', 'PRICE_RANGE_ADJUST', 'NEW_RULE', 'NEW_CANONICAL']),
  confidence: z.number().min(0).max(1),
  payload: z.record(z.unknown()),
});

/**
 * Runtime validation schema for LineDecision
 */
export const ZLineDecision = z.object({
  lineId: z.string(),
  policy: ZPolicyCode,
  reasons: z.array(z.string()).default([]),
  canonicalItemId: z.string().nullable().optional(),
  priceBand: ZPriceBand.nullable().optional(),
  judge: ZJudgeScores.optional(),
  traceId: z.string().optional(),
  proposals: z.array(ZProposal).default([]),
});

/**
 * Runtime validation schema for AgentRunResponse
 */
export const ZAgentRunResponse = z.object({
  decisions: z.array(ZLineDecision),
  runId: z.string(),
  judgeSummary: z.object({
    avgPolicyScore: z.number().min(0).max(1),
    avgPriceCheckScore: z.number().min(0).max(1),
    avgExplanationScore: z.number().min(0).max(1),
  }).optional(),
});

// Type assertions to ensure schema and type compatibility
type _PolicyCodeCheck = z.infer<typeof ZPolicyCode> extends PolicyCode ? true : never;
type _JudgeScoresCheck = z.infer<typeof ZJudgeScores> extends JudgeScores ? true : never;
type _PriceBandCheck = z.infer<typeof ZPriceBand> extends PriceBand ? true : never;
type _ProposalCheck = z.infer<typeof ZProposal> extends Proposal ? true : never;
type _LineDecisionCheck = z.infer<typeof ZLineDecision> extends LineDecision ? true : never;
type _AgentRunResponseCheck = z.infer<typeof ZAgentRunResponse> extends AgentRunResponse ? true : never;