/**
 * Pre-Validation Agent for invoice line items
 * Implements blacklist checks, structural validation, and GPT-5 relevance checking
 */

import { OpenRouterService, createOpenRouterService } from '../llm/openrouter-service';

export interface PreValidationResult {
  verdict: 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';
  score?: number; // 0-1 likelihood of being material/equipment
  reasons: string[];
  blacklistedTerm?: string;
  llmReasoning?: string; // GPT-5 reasoning when used
  explanationPrompt?: string; // Specific question for user when relevance is uncertain
}

export interface ValidationInput {
  name: string;
  description?: string;
  serviceLine?: string;
  serviceType?: string;
  scopeOfWork?: string;
}

// Blacklisted terms that should immediately reject items
const BLACKLISTED_TERMS = [
  // Labor/human resources
  'helper', 'labour', 'labor', 'technician', 'worker', 'employee',
  'consultant', 'contractor', 'specialist', 'engineer', 'supervisor',
  
  // Fees and charges
  'fees', 'fee', 'charges', 'charge', 'visit', 'trip', 'mileage',
  'travel', 'overtime', 'hourly', 'daily', 'weekly', 'monthly',
  
  // Taxes and admin
  'tax', 'gst', 'vat', 'hst', 'pst', 'sales tax', 'convenience',
  'processing', 'handling', 'administration', 'admin',
  
  // Miscellaneous/unclear
  'misc', 'miscellaneous', 'other', 'various', 'n/a', 'na', 
  'tbd', 'to be determined', '--', '---', 'test', 'testing',
  
  // Personal items
  'food', 'beverage', 'coffee', 'lunch', 'dinner', 'personal',
  'clothing', 'uniform', 'boots', 'gloves', 'helmet',
];

// Allowlist patterns for legitimate FM materials
const ALLOWLIST_PATTERNS = [
  // ANSI/industry standards
  /ansi\s*\d+/i,
  /nfpa\s*\d+/i,
  /astm\s*[a-z]?\d+/i,
  /ieee\s*\d+/i,
  
  // Pipe/thread specifications
  /\d+\/\d+\s*inch/i,
  /\d+\.\d+\s*inch/i,
  /\d+\s*mm/i,
  /\d+\s*cm/i,
  /npt\s*\d+/i,
  /bsp\s*\d+/i,
  
  // Common measurements
  /\d+\s*ft/i,
  /\d+\s*feet/i,
  /\d+\s*meter/i,
  /\d+\s*gauge/i,
  /\d+\s*awg/i,
  
  // Material specifications
  /copper/i,
  /steel/i,
  /aluminum/i,
  /pvc/i,
  /abs/i,
  /hdpe/i,
];

/**
 * Performs fast rule-based validation checks
 */
export function performRuleBasedValidation(input: ValidationInput): PreValidationResult {
  const { name, description = '' } = input;
  const fullText = `${name} ${description}`.toLowerCase().trim();
  
  // Check 1: Empty or too short
  if (!name || name.trim().length === 0) {
    return {
      verdict: 'REJECTED',
      reasons: ['Empty item name'],
    };
  }
  
  if (name.trim().length < 2) {
    return {
      verdict: 'REJECTED',
      reasons: ['Item name too short'],
    };
  }
  
  // Check 2: Numeric-only (likely codes or IDs, not material descriptions)
  if (/^\d+[\s\-\._]*\d*$/.test(name.trim())) {
    return {
      verdict: 'REJECTED',
      reasons: ['Numeric-only item name'],
    };
  }
  
  // Check 3: Symbols-only or mostly symbols
  if (/^[\W_\s]+$/.test(name.trim()) || name.replace(/[\W_\s]/g, '').length < 2) {
    return {
      verdict: 'REJECTED',
      reasons: ['Invalid characters or symbols-only'],
    };
  }
  
  // Check 4: Blacklisted terms (word boundary check to avoid false positives)
  for (const term of BLACKLISTED_TERMS) {
    const regex = new RegExp(`\\b${term.toLowerCase()}\\b`, 'i');
    if (regex.test(fullText)) {
      return {
        verdict: 'REJECTED',
        reasons: ['Contains blacklisted term'],
        blacklistedTerm: term,
      };
    }
  }
  
  // Check 5: Profanity/inappropriate content (basic check)
  const profanityPatterns = [
    /fuck/i, /shit/i, /damn/i, /hell/i, /ass/i, /bitch/i,
    /crap/i, /piss/i, /bastard/i, /bloody/i,
  ];
  
  for (const pattern of profanityPatterns) {
    if (pattern.test(fullText)) {
      return {
        verdict: 'REJECTED',
        reasons: ['Contains inappropriate language'],
      };
    }
  }
  
  // Check 6: Allowlist patterns (high confidence for legitimate materials)
  let hasAllowlistMatch = false;
  for (const pattern of ALLOWLIST_PATTERNS) {
    if (pattern.test(fullText)) {
      hasAllowlistMatch = true;
      break;
    }
  }
  
  if (hasAllowlistMatch) {
    return {
      verdict: 'APPROVED',
      score: 0.9,
      reasons: ['Matches known FM material pattern'],
    };
  }
  
  // Check 7: Common FM material keywords
  const fmKeywords = [
    'pipe', 'fitting', 'valve', 'gasket', 'seal', 'bolt', 'screw',
    'nut', 'washer', 'clamp', 'bracket', 'mount', 'plate',
    'wire', 'cable', 'conduit', 'junction', 'outlet', 'switch',
    'breaker', 'fuse', 'transformer', 'motor', 'pump', 'fan',
    'filter', 'screen', 'grate', 'drain', 'vent', 'duct',
    'insulation', 'sealant', 'adhesive', 'tape', 'rope', 'chain',
    'tool', 'wrench', 'drill', 'bit', 'blade', 'hammer',
    'fastener', 'anchor', 'stud', 'beam', 'post', 'panel',
    // Building components
    'transom', 'door', 'window', 'frame', 'hinge', 'handle',
    'concrete', 'cement', 'mortar', 'grout', 'tile', 'lumber',
    'plywood', 'drywall', 'sheetrock', 'flooring', 'ceiling',
    // Equipment
    'jackhammer', 'excavator', 'compressor', 'generator', 'welder',
    'saw', 'cutter', 'grinder', 'sander', 'blower', 'vacuum',
    // Plumbing specific
    'jetter', 'auger', 'snake', 'camera', 'scope', 'cleanout',
    'coupling', 'elbow', 'tee', 'union', 'nipple', 'plug',
  ];
  
  let keywordMatches = 0;
  for (const keyword of fmKeywords) {
    if (fullText.includes(keyword)) {
      keywordMatches++;
    }
  }
  
  if (keywordMatches > 0) {
    return {
      verdict: 'APPROVED',
      score: Math.min(0.7 + (keywordMatches * 0.1), 0.95),
      reasons: [`Contains ${keywordMatches} FM material keyword(s)`],
    };
  }
  
  // Default: needs LLM review for ambiguous cases
  return {
    verdict: 'NEEDS_REVIEW',
    score: 0.5,
    reasons: ['Ambiguous item - requires LLM classification'],
  };
}

/**
 * Enhanced structural validation
 */
export function performStructuralValidation(input: ValidationInput): PreValidationResult {
  const { name, description = '' } = input;
  
  // Check for suspiciously generic terms
  const genericTerms = [
    'item', 'thing', 'stuff', 'product', 'material', 'component',
    'part', 'piece', 'unit', 'element', 'object', 'device',
    'nothing', 'something', 'anything', 'everything', 'none',
    'unknown', 'blank', 'empty', 'placeholder', 'dummy', 'sample'
  ];
  
  const nameWords = name.toLowerCase().split(/\s+/);
  
  // Check for single generic terms
  if (nameWords.length === 1 && genericTerms.includes(nameWords[0])) {
    return {
      verdict: 'REJECTED',
      reasons: ['Too generic - single generic term'],
    };
  }
  
  // Check for multiple generic terms or repeated generic words (like "Item Items")
  const genericWordCount = nameWords.filter(word => genericTerms.includes(word)).length;
  if (genericWordCount >= 2 || (genericWordCount === 1 && nameWords.length <= 3)) {
    return {
      verdict: 'REJECTED',
      reasons: ['Too generic - contains multiple generic terms or insufficient specificity'],
    };
  }
  
  // Check for repeated characters (spam detection)
  if (/(.)\1{4,}/.test(name)) { // 5+ repeated characters
    return {
      verdict: 'REJECTED',
      reasons: ['Contains repeated characters (spam pattern)'],
    };
  }
  
  // Enhanced spam/gibberish detection - refined to avoid false positives
  const spamPatterns = [
    /[a-z]{20,}/i, // Very long sequences of letters (20+ chars) - increased from 15
    /\d{10,}/, // Very long sequences of numbers (10+ digits)
    /[!@#$%^&*()]{3,}/, // Multiple special characters
    /^(la){4,}$/i, // Repetitive patterns like "lalalala" - increased threshold
    /^(ha){4,}$/i, // "hahahaha" - increased threshold
    /^(test){2,}$/i, // "testtest", "testtesttest"
    /^(abc){3,}$/i, // "abcabcabc" - increased threshold
    /^([a-z])\1{4,}$/i, // "aaaaa", "bbbbb", etc. - increased threshold
    /^(123){3,}$/, // "123123123" - increased threshold
    /^[qwertyuiop]{6,}$/i, // Keyboard mashing - increased threshold
    /^[asdfghjkl]{6,}$/i, // Keyboard row - increased threshold
    /^[zxcvbnm]{6,}$/i, // Bottom keyboard row - increased threshold
    /^(random|test|placeholder|dummy|sample){2,}$/i, // Obvious test patterns
    /^[xyz]{4,}$/i, // Common test patterns
  ];
  
  // Check for obvious gibberish patterns
  for (const pattern of spamPatterns) {
    if (pattern.test(name.trim())) {
      return {
        verdict: 'REJECTED',
        reasons: ['Appears to be gibberish or random text'],
      };
    }
  }
  
  // Check for non-sensical letter combinations (consonant clusters without vowels)
  // BUT exclude numeric patterns, measurements, and codes
  const hasNumbers = /\d/.test(name);
  const hasMeasurementPattern = /\d+\s*[x×]\s*\d+|\d+\s*inch|\d+\s*ft|\d+\s*mm|\d+\s*cm/i.test(name);
  const isShortCode = name.length <= 6; // Codes/abbreviations can lack vowels
  
  if (name.length > 6 && !hasNumbers && !hasMeasurementPattern && !isShortCode && !/[aeiou]/i.test(name)) {
    return {
      verdict: 'REJECTED',
      reasons: ['Invalid word structure - no vowels'],
    };
  }
  
  // Legacy random patterns check
  const randomPatterns = [
    /[!@#$%^&*()]{3,}/, // Multiple special characters (already covered above but keeping for safety)
  ];
  
  for (const pattern of randomPatterns) {
    if (pattern.test(name)) {
      return {
        verdict: 'REJECTED',
        reasons: ['Contains random or invalid patterns'],
      };
    }
  }
  
  // All structural checks passed
  return {
    verdict: 'APPROVED',
    score: 0.8,
    reasons: ['Passed structural validation'],
  };
}

/**
 * GPT-5 enhanced relevance validation
 */
async function performLLMRelevanceValidation(
  input: ValidationInput,
  openRouterService: OpenRouterService
): Promise<PreValidationResult> {
  const { name, description, serviceLine, serviceType, scopeOfWork } = input;
  
  // Skip LLM validation if we don't have service context
  if (!serviceLine || !serviceType) {
    return {
      verdict: 'NEEDS_REVIEW',
      score: 0.5,
      reasons: ['Missing service context for LLM validation'],
    };
  }
  
  // FAST REJECTION: Skip expensive LLM call for obvious garbage
  const fastRejectPatterns = [
    /^(la){3,}$/i, // "lalala", "lalalala", etc. - increased threshold
    /^(ha){3,}$/i, // "hahaha", "hahahaha" - increased threshold
    /^(test){2,}$/i, // "testtest"
    /^[qwertyuiop]{6,}$/i, // Keyboard mashing - increased threshold
    /^[asdfghjkl]{6,}$/i, // Keyboard row - increased threshold
    /^[zxcvbnm]{6,}$/i, // Bottom row - increased threshold
    /^(random|placeholder|dummy|sample){2,}$/i, // Obvious test patterns
  ];
  
  for (const pattern of fastRejectPatterns) {
    if (pattern.test(name.trim())) {
      return {
        verdict: 'REJECTED',
        score: 0.1,
        reasons: ['GPT-5: Obviously irrelevant gibberish - skipped expensive validation'],
      };
    }
  }
  
  try {
    const relevanceResult = await openRouterService.validateRelevance(
      name,
      description,
      serviceLine,
      serviceType,
      scopeOfWork
    );
    
    // Enhanced relevance decision logic with smarter thresholds
    if (!relevanceResult.isRelevant || relevanceResult.confidence <= 0.3) {
      return {
        verdict: 'REJECTED',
        score: relevanceResult.confidence,
        reasons: ['GPT-5: Item not relevant for service context'],
        llmReasoning: relevanceResult.reasoning,
      };
    }
    
    // High confidence relevance - approve
    if (relevanceResult.confidence >= 0.7) {
      return {
        verdict: 'APPROVED',
        score: relevanceResult.confidence,
        reasons: ['GPT-5: High confidence item relevance'],
        llmReasoning: relevanceResult.reasoning,
      };
    }
    
    // Medium confidence (0.4-0.6) - valid FM item but questionable relevance
    // This is the key enhancement: ask for specific explanation
    return {
      verdict: 'NEEDS_REVIEW',
      score: relevanceResult.confidence,
      reasons: ['GPT-5: Valid FM item but unclear relevance to service context'],
      llmReasoning: relevanceResult.reasoning,
      explanationPrompt: relevanceResult.explanationPrompt || 
        `This appears to be a valid facilities management item, but its relevance to ${serviceType} work is unclear. Please explain how "${name}" will be used in your ${scopeOfWork ? scopeOfWork : 'project'}.`
    };
    
  } catch (error) {
    console.error('LLM relevance validation error:', error);
    
    // If it's a timeout error, likely garbage input - reject it
    if (error instanceof Error && error.message.includes('timeout')) {
      return {
        verdict: 'REJECTED',
        score: 0.1,
        reasons: ['LLM validation timeout - likely invalid or irrelevant item'],
        llmReasoning: `Timeout: ${error.message}`,
      };
    }
    
    // Other errors still need human review
    return {
      verdict: 'NEEDS_REVIEW',
      score: 0.5,
      reasons: ['LLM validation failed - requires human review'],
      llmReasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Main pre-validation function that combines all checks
 */
export function preValidateItem(input: ValidationInput): PreValidationResult {
  // Run rule-based validation first (fastest) - checks blacklist, basic structure
  const ruleResult = performRuleBasedValidation(input);
  if (ruleResult.verdict === 'REJECTED') {
    return ruleResult;
  }
  
  // Run structural validation - checks generic terms, spam patterns, etc.
  const structuralResult = performStructuralValidation(input);
  if (structuralResult.verdict === 'REJECTED') {
    return structuralResult;
  }
  
  // If both approve, choose the higher confidence result
  if (ruleResult.verdict === 'APPROVED' && structuralResult.verdict === 'APPROVED') {
    return (ruleResult.score || 0) > (structuralResult.score || 0) ? ruleResult : structuralResult;
  }
  
  // If rule-based approved but structural needs review, approve with lower confidence
  if (ruleResult.verdict === 'APPROVED') {
    return ruleResult;
  }
  
  // If structural approved but rule-based needs review, still needs LLM review
  if (structuralResult.verdict === 'APPROVED') {
    return {
      verdict: 'NEEDS_REVIEW',
      score: Math.min(structuralResult.score || 0.5, 0.7), // Cap confidence for review
      reasons: ['Passed structure but needs content classification'],
    };
  }
  
  // Both need review
  return {
    verdict: 'NEEDS_REVIEW',
    score: 0.5,
    reasons: ['Ambiguous item - requires LLM classification'],
  };
}

/**
 * Enhanced pre-validation function with GPT-5 integration
 */
export async function preValidateItemEnhanced(input: ValidationInput): Promise<PreValidationResult> {
  // Run basic validations first (fast rejection path)
  const basicResult = preValidateItem(input);
  if (basicResult.verdict === 'REJECTED') {
    return basicResult;
  }
  
  // If approved by rules with high confidence, skip expensive LLM call for performance
  if (basicResult.verdict === 'APPROVED' && (basicResult.score || 0) >= 0.8) {
    return basicResult; // Skip LLM for high-confidence rule-based approvals
  }
  
  // If approved by rules, still check LLM for service relevance when context is available
  if (basicResult.verdict === 'APPROVED' && input.serviceLine && input.serviceType) {
    try {
      const openRouterService = createOpenRouterService();
      const llmResult = await performLLMRelevanceValidation(input, openRouterService);
      
      // If LLM rejects, override the rule-based approval
      if (llmResult.verdict === 'REJECTED') {
        return {
          ...llmResult,
          reasons: [...basicResult.reasons, ...llmResult.reasons],
        };
      }
      
      // Combine results for approved/needs review cases
      return {
        verdict: basicResult.verdict,
        score: Math.max(basicResult.score || 0.5, llmResult.score || 0.5),
        reasons: [...basicResult.reasons, ...llmResult.reasons],
        llmReasoning: llmResult.llmReasoning,
        explanationPrompt: llmResult.explanationPrompt,
      };
    } catch (error) {
      // If LLM fails, fall back to rule-based result
      console.error('Enhanced pre-validation LLM error:', error);
      return {
        ...basicResult,
        reasons: [...basicResult.reasons, 'LLM enhancement unavailable'],
      };
    }
  }
  
  // For NEEDS_REVIEW cases, try LLM validation
  if (basicResult.verdict === 'NEEDS_REVIEW' && input.serviceLine && input.serviceType) {
    try {
      const openRouterService = createOpenRouterService();
      const llmResult = await performLLMRelevanceValidation(input, openRouterService);
      
      return {
        verdict: llmResult.verdict,
        score: llmResult.score,
        reasons: [...basicResult.reasons, ...llmResult.reasons],
        llmReasoning: llmResult.llmReasoning,
        explanationPrompt: llmResult.explanationPrompt,
      };
    } catch (error) {
      console.error('Enhanced pre-validation LLM error:', error);
      return {
        ...basicResult,
        reasons: [...basicResult.reasons, 'LLM enhancement failed'],
      };
    }
  }
  
  // Return basic result if no LLM enhancement needed/possible
  return basicResult;
}