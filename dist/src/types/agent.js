"use strict";
/**
 * Agent decision types and validation schemas
 * Used for /api/agent_run_crew responses and related data structures
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZAgentRunResponse = exports.ZLineDecision = exports.ZProposal = exports.ZPriceBand = exports.ZJudgeScores = exports.ZPolicyCode = void 0;
var zod_1 = require("zod");
// Zod validation schemas
// Keep in same file to prevent drift between types and validators
/**
 * Runtime validation schema for PolicyCode
 */
exports.ZPolicyCode = zod_1.z.enum(['ALLOW', 'DENY', 'NEEDS_MORE_INFO']);
/**
 * Runtime validation schema for JudgeScores
 */
exports.ZJudgeScores = zod_1.z.object({
    policyScore: zod_1.z.number().min(0).max(1),
    priceCheckScore: zod_1.z.number().min(0).max(1),
    explanationScore: zod_1.z.number().min(0).max(1),
});
/**
 * Runtime validation schema for PriceBand
 */
exports.ZPriceBand = zod_1.z.object({
    min: zod_1.z.number().min(0),
    max: zod_1.z.number().min(0),
});
/**
 * Runtime validation schema for Proposal
 */
exports.ZProposal = zod_1.z.object({
    type: zod_1.z.enum(['NEW_SYNONYM', 'PRICE_RANGE_ADJUST', 'NEW_RULE', 'NEW_CANONICAL']),
    confidence: zod_1.z.number().min(0).max(1),
    payload: zod_1.z.record(zod_1.z.unknown()),
});
/**
 * Runtime validation schema for LineDecision
 */
exports.ZLineDecision = zod_1.z.object({
    lineId: zod_1.z.string(),
    policy: exports.ZPolicyCode,
    reasons: zod_1.z.array(zod_1.z.string()),
    canonicalItemId: zod_1.z.string().nullable().optional(),
    priceBand: exports.ZPriceBand.nullable().optional(),
    judge: exports.ZJudgeScores.optional(),
    traceId: zod_1.z.string().optional(),
    proposals: zod_1.z.array(exports.ZProposal).optional(),
});
/**
 * Runtime validation schema for AgentRunResponse
 */
exports.ZAgentRunResponse = zod_1.z.object({
    decisions: zod_1.z.array(exports.ZLineDecision),
    runId: zod_1.z.string(),
    judgeSummary: zod_1.z.object({
        avgPolicyScore: zod_1.z.number().min(0).max(1),
        avgPriceCheckScore: zod_1.z.number().min(0).max(1),
        avgExplanationScore: zod_1.z.number().min(0).max(1),
    }).optional(),
});
