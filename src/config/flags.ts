/**
 * Feature flags for conditional UI rendering
 * Centralized control over experimental or optional features
 */

/**
 * Application feature flags
 */
export const FLAGS = {
  /** Whether to show judge evaluation scores in the UI */
  ENABLE_JUDGE_SCORES: true,
  
  /** Whether to enable trace links for observability */
  ENABLE_TRACE_LINKS: true,
  
  /** Whether to show proposal counts in line items */
  SHOW_PROPOSAL_COUNTS: true,
  
  /** Whether to enable Langfuse tracing */
  ENABLE_LANGFUSE: true,
} as const;

/**
 * Type definition for feature flags
 */
export type FeatureFlags = typeof FLAGS;