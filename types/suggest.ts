/**
 * Item suggestion types and validation schemas
 * Used for /api/suggest_items responses and typeahead functionality
 */

import { z } from 'zod';

/**
 * Individual item suggestion from typeahead API
 */
export interface Suggestion {
  /** Unique identifier for this suggestion */
  id: string;
  /** Display name for the suggested item */
  name: string;
  /** Relevance score (0..1, higher is better match) */
  score: number;
  /** Algorithm that generated this suggestion */
  reason?: 'fuzzy' | 'synonym' | 'vendor_boost' | 'band_bonus' | 'embedding';
}

/**
 * Complete response from suggest items API
 */
export interface SuggestResponse {
  /** Array of ranked suggestions */
  suggestions: Suggestion[];
}

// Zod validation schemas
// Keep in same file to prevent drift between types and validators

/**
 * Runtime validation schema for suggestion reasons
 */
export const ZSuggestionReason = z.enum(['fuzzy', 'synonym', 'vendor_boost', 'band_bonus', 'embedding']);

/**
 * Runtime validation schema for Suggestion
 */
export const ZSuggestion = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number().min(0).max(1),
  reason: ZSuggestionReason.optional(),
});

/**
 * Runtime validation schema for SuggestResponse
 */
export const ZSuggestResponse = z.object({
  suggestions: z.array(ZSuggestion),
});

// Type assertions to ensure schema and type compatibility
type _SuggestionCheck = z.infer<typeof ZSuggestion> extends Suggestion ? true : never;
type _SuggestResponseCheck = z.infer<typeof ZSuggestResponse> extends SuggestResponse ? true : never;