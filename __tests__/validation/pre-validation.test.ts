/**
 * Unit tests for pre-validation logic
 */

import { preValidateItem, performRuleBasedValidation, performStructuralValidation } from '@/lib/validation/pre-validation';

describe('Pre-Validation Rule-Based Checks', () => {
  describe('Empty/Invalid Input', () => {
    test('should reject empty item name', () => {
      const result = performRuleBasedValidation({ name: '' });
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Empty item name');
    });

    test('should reject very short item name', () => {
      const result = performRuleBasedValidation({ name: 'a' });
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Item name too short');
    });

    test('should reject numeric-only names', () => {
      const result = performRuleBasedValidation({ name: '12345' });
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Numeric-only item name');
    });

    test('should reject symbols-only names', () => {
      const result = performRuleBasedValidation({ name: '---' });
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Invalid characters or symbols-only');
    });
  });

  describe('Blacklisted Terms', () => {
    test('should reject labor terms', () => {
      const laborTerms = ['helper', 'technician', 'labor', 'labour'];
      
      laborTerms.forEach(term => {
        const result = performRuleBasedValidation({ name: `Service ${term} charges` });
        expect(result.verdict).toBe('REJECTED');
        expect(result.reasons).toContain('Contains blacklisted term');
        expect(result.blacklistedTerm).toBe(term);
      });
    });

    test('should reject fee terms', () => {
      const feeTerms = ['fees', 'charges', 'visit', 'convenience'];
      
      feeTerms.forEach(term => {
        const result = performRuleBasedValidation({ name: `Processing ${term}` });
        expect(result.verdict).toBe('REJECTED');
        expect(result.reasons).toContain('Contains blacklisted term');
      });
    });

    test('should reject tax terms', () => {
      const taxTerms = ['tax', 'gst', 'vat', 'hst'];
      
      taxTerms.forEach(term => {
        const result = performRuleBasedValidation({ name: `Sales ${term}` });
        expect(result.verdict).toBe('REJECTED');
        expect(result.reasons).toContain('Contains blacklisted term');
      });
    });

    test('should reject miscellaneous terms', () => {
      const miscTerms = ['misc', 'n/a', 'test'];
      
      miscTerms.forEach(term => {
        const result = performRuleBasedValidation({ name: term });
        expect(result.verdict).toBe('REJECTED');
        expect(result.reasons).toContain('Contains blacklisted term');
      });
      
      // Handle '--' separately as it gets caught by symbols-only check first
      const dashResult = performRuleBasedValidation({ name: '--' });
      expect(dashResult.verdict).toBe('REJECTED');
      expect(dashResult.reasons).toContain('Invalid characters or symbols-only');
    });
  });

  describe('Profanity Detection', () => {
    test('should reject items with profanity', () => {
      const profaneTerms = ['fucking wrench', 'damn pipe', 'shit tools'];
      
      profaneTerms.forEach(term => {
        const result = performRuleBasedValidation({ name: term });
        expect(result.verdict).toBe('REJECTED');
        expect(result.reasons).toContain('Contains inappropriate language');
      });
    });
  });

  describe('Allowlist Patterns', () => {
    test('should approve ANSI standards', () => {
      const ansiItems = ['ANSI 125 valve', 'nfpa 70 compliant wire', 'astm a53 pipe'];
      
      ansiItems.forEach(item => {
        const result = performRuleBasedValidation({ name: item });
        expect(result.verdict).toBe('APPROVED');
        expect(result.score).toBeGreaterThan(0.8);
        expect(result.reasons).toContain('Matches known FM material pattern');
      });
    });

    test('should approve pipe specifications', () => {
      const pipeItems = ['1/2 inch pipe', '2.5 inch conduit', '10mm tubing'];
      
      pipeItems.forEach(item => {
        const result = performRuleBasedValidation({ name: item });
        expect(result.verdict).toBe('APPROVED');
        expect(result.score).toBeGreaterThan(0.8);
      });
    });

    test('should approve thread specifications', () => {
      const threadItems = ['NPT 1/2 fitting', 'BSP 3/4 connector'];
      
      threadItems.forEach(item => {
        const result = performRuleBasedValidation({ name: item });
        expect(result.verdict).toBe('APPROVED');
        expect(result.score).toBeGreaterThan(0.8);
      });
    });
  });

  describe('FM Material Keywords', () => {
    test('should approve common FM materials', () => {
      const fmMaterials = [
        'pipe fitting',
        'electrical wire',
        'HVAC filter',
        'plumbing valve',
        'steel bolt',
        'copper gasket',
        'motor pump',
        'safety equipment'
      ];
      
      fmMaterials.forEach(material => {
        const result = performRuleBasedValidation({ name: material });
        expect(result.verdict).toBe('APPROVED');
        expect(result.score).toBeGreaterThan(0.6);
        expect(result.reasons[0]).toMatch(/Contains \d+ FM material keyword/);
      });
    });

    test('should give higher scores for multiple keywords', () => {
      const multiKeywordItem = 'copper pipe fitting with valve and gasket';
      const result = performRuleBasedValidation({ name: multiKeywordItem });
      
      expect(result.verdict).toBe('APPROVED');
      expect(result.score).toBeGreaterThan(0.8);
    });
  });

  describe('Ambiguous Cases', () => {
    test('should flag ambiguous items for review', () => {
      const ambiguousItems = [
        'replacement component',
        'special part',
        'custom equipment',
        'maintenance item'
      ];
      
      ambiguousItems.forEach(item => {
        const result = performRuleBasedValidation({ name: item });
        expect(result.verdict).toBe('NEEDS_REVIEW');
        expect(result.reasons).toContain('Ambiguous item - requires LLM classification');
      });
    });
  });
});

describe('Structural Validation', () => {
  test('should reject single generic terms', () => {
    const genericTerms = ['item', 'thing', 'stuff', 'component'];
    
    genericTerms.forEach(term => {
      const result = performStructuralValidation({ name: term });
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Too generic - single generic term');
    });
  });

  test('should reject spam patterns', () => {
    const spamPatterns = ['aaaaaa wrench', 'pipe!!!!!', 'valve@@@@@'];
    
    spamPatterns.forEach(pattern => {
      const result = performStructuralValidation({ name: pattern });
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Contains repeated characters (spam pattern)');
    });
  });

  test('should reject random character sequences', () => {
    const randomSequences = [
      'abcdefghijklmnop', // Long letter sequence
      '123456789012345', // Long number sequence
      'pipe!@#$%^&*()', // Multiple special characters
    ];
    
    randomSequences.forEach(sequence => {
      const result = performStructuralValidation({ name: sequence });
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Contains random or invalid patterns');
    });
  });

  test('should approve valid structural patterns', () => {
    const validItems = [
      'copper pipe fitting',
      'electrical outlet cover',
      'HVAC air filter',
      '1/2 inch ball valve'
    ];
    
    validItems.forEach(item => {
      const result = performStructuralValidation({ name: item });
      expect(result.verdict).toBe('APPROVED');
      expect(result.reasons).toContain('Passed structural validation');
    });
  });
});

describe('Combined Pre-Validation', () => {
  test('should approve clear FM materials', () => {
    const fmMaterials = [
      'ANSI 150 flanged ball valve',
      '1/2 inch copper pipe',
      'electrical wire nuts',
      'HVAC duct insulation'
    ];
    
    fmMaterials.forEach(material => {
      const result = preValidateItem({ name: material });
      expect(result.verdict).toBe('APPROVED');
      expect(result.score).toBeGreaterThan(0.7);
    });
  });

  test('should reject clearly inappropriate items', () => {
    const inappropriateItems = [
      'technician labor',
      'lunch expenses',
      'sales tax',
      'fucking tools',
      '', // empty
      '123456', // numeric only
    ];
    
    inappropriateItems.forEach(item => {
      const result = preValidateItem({ name: item });
      expect(result.verdict).toBe('REJECTED');
    });
  });

  test('should flag ambiguous items for LLM review', () => {
    const ambiguousItems = [
      'replacement parts',
      'maintenance supplies',
      'custom component',
      'special equipment'
    ];
    
    ambiguousItems.forEach(item => {
      const result = preValidateItem({ name: item });
      expect(result.verdict).toBe('NEEDS_REVIEW');
    });
  });

  test('should handle descriptions in validation', () => {
    const result = preValidateItem({
      name: 'Special component',
      description: 'Copper pipe fitting for plumbing installation'
    });
    
    // Should approve due to FM keywords in description
    expect(result.verdict).toBe('APPROVED');
    expect(result.score).toBeGreaterThan(0.7);
  });

  test('should prioritize rule-based rejection over approval', () => {
    // Item with FM keywords but blacklisted term
    const result = preValidateItem({
      name: 'pipe technician labor'
    });
    
    expect(result.verdict).toBe('REJECTED');
    expect(result.blacklistedTerm).toBe('technician');
  });
});