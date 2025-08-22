/**
 * Pre-Validation Agent for invoice line items
 * Implements blacklist checks and structural validation before LLM processing
 */

export interface PreValidationResult {
  verdict: 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';
  score?: number; // 0-1 likelihood of being material/equipment
  reasons: string[];
  blacklistedTerm?: string;
}

export interface ValidationInput {
  name: string;
  description?: string;
  serviceLine?: string;
  serviceType?: string;
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
  
  // Check 4: Blacklisted terms
  for (const term of BLACKLISTED_TERMS) {
    if (fullText.includes(term.toLowerCase())) {
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
  ];
  
  const nameWords = name.toLowerCase().split(/\s+/);
  if (nameWords.length === 1 && genericTerms.includes(nameWords[0])) {
    return {
      verdict: 'REJECTED',
      reasons: ['Too generic - single generic term'],
    };
  }
  
  // Check for repeated characters (spam detection)
  if (/(.)\1{4,}/.test(name)) { // 5+ repeated characters
    return {
      verdict: 'REJECTED',
      reasons: ['Contains repeated characters (spam pattern)'],
    };
  }
  
  // Check for random character sequences
  const randomPatterns = [
    /[a-z]{10,}/i, // Very long sequences of letters
    /\d{8,}/, // Very long sequences of numbers
    /[!@#$%^&*()]{3,}/, // Multiple special characters
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
 * Main pre-validation function that combines all checks
 */
export function preValidateItem(input: ValidationInput): PreValidationResult {
  // Run rule-based validation first (fastest)
  const ruleResult = performRuleBasedValidation(input);
  if (ruleResult.verdict === 'REJECTED') {
    return ruleResult;
  }
  
  // Run structural validation
  const structuralResult = performStructuralValidation(input);
  if (structuralResult.verdict === 'REJECTED') {
    return structuralResult;
  }
  
  // If rule-based found a good match, use that
  if (ruleResult.verdict === 'APPROVED') {
    return ruleResult;
  }
  
  // If structural validation approved but rule-based was inconclusive
  if (structuralResult.verdict === 'APPROVED' && ruleResult.verdict === 'NEEDS_REVIEW') {
    return {
      verdict: 'NEEDS_REVIEW', // Still needs LLM review for content classification
      score: Math.max(structuralResult.score || 0.5, ruleResult.score || 0.5),
      reasons: [...ruleResult.reasons, ...structuralResult.reasons],
    };
  }
  
  // Default to needs review
  return {
    verdict: 'NEEDS_REVIEW',
    score: 0.5,
    reasons: ['Requires LLM classification'],
  };
}