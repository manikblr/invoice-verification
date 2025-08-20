"use strict";
/**
 * Item suggestion types and validation schemas
 * Used for /api/suggest_items responses and typeahead functionality
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZSuggestResponse = exports.ZSuggestion = exports.ZSuggestionReason = void 0;
var zod_1 = require("zod");
// Zod validation schemas
// Keep in same file to prevent drift between types and validators
/**
 * Runtime validation schema for suggestion reasons
 */
exports.ZSuggestionReason = zod_1.z.enum(['fuzzy', 'synonym', 'vendor_boost', 'band_bonus', 'embedding']);
/**
 * Runtime validation schema for Suggestion
 */
exports.ZSuggestion = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    score: zod_1.z.number().min(0).max(1),
    reason: exports.ZSuggestionReason.optional(),
});
/**
 * Runtime validation schema for SuggestResponse
 */
exports.ZSuggestResponse = zod_1.z.object({
    suggestions: zod_1.z.array(exports.ZSuggestion),
});
