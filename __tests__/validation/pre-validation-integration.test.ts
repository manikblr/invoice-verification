/**
 * Integration tests for enhanced pre-validation
 */

import { describe, test, expect } from '@jest/globals';
import { preValidateItem, preValidateItemEnhanced, ValidationInput } from '../../lib/validation/pre-validation';

describe('Pre-Validation Integration Tests', () => {
  describe('Basic pre-validation (without LLM)', () => {
    test('should approve FM material keywords', () => {
      const input: ValidationInput = {
        name: 'HVAC filter replacement',
      };

      const result = preValidateItem(input);
      
      expect(result.verdict).toBe('APPROVED');
      expect(result.score).toBeGreaterThan(0.7);
      expect(result.reasons).toContain('Contains 1 FM material keyword(s)');
    });

    test('should reject blacklisted labor terms', () => {
      const input: ValidationInput = {
        name: 'technician labor hours',
      };

      const result = preValidateItem(input);
      
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Contains blacklisted term');
      expect(result.blacklistedTerm).toBe('labor');
    });

    test('should approve allowlist patterns', () => {
      const input: ValidationInput = {
        name: '1/2 inch copper pipe fitting',
      };

      const result = preValidateItem(input);
      
      expect(result.verdict).toBe('APPROVED');
      expect(result.score).toBe(0.9);
      expect(result.reasons).toContain('Matches known FM material pattern');
    });

    test('should flag ambiguous items for review', () => {
      const input: ValidationInput = {
        name: 'specialty item X123',
      };

      const result = preValidateItem(input);
      
      expect(result.verdict).toBe('NEEDS_REVIEW');
      expect(result.reasons).toContain('Ambiguous item - requires LLM classification');
    });
  });

  describe('Enhanced pre-validation with service context', () => {
    test('should work with service context even when LLM fails', async () => {
      const input: ValidationInput = {
        name: 'HVAC filter replacement',
        serviceLine: 'HVAC Maintenance',
        serviceType: 'Preventive Maintenance',
      };

      const result = await preValidateItemEnhanced(input);
      
      // Should still get rule-based approval even if LLM fails
      expect(result.verdict).toBe('APPROVED');
      expect(result.score).toBeGreaterThan(0.7);
      expect(result.reasons).toContain('Contains 1 FM material keyword(s)');
    });

    test('should work without service context', async () => {
      const input: ValidationInput = {
        name: 'copper pipe fitting',
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('APPROVED');
      expect(result.score).toBeGreaterThan(0.7);
      expect(result.reasons).toContain('Matches known FM material pattern');
    });

    test('should reject blacklisted terms without LLM call', async () => {
      const input: ValidationInput = {
        name: 'consultant fees',
        serviceLine: 'General Maintenance',
        serviceType: 'Consultation',
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Contains blacklisted term');
      expect(result.blacklistedTerm).toBe('consultant');
    });

    test('should handle structural validation failures', async () => {
      const input: ValidationInput = {
        name: '',
        serviceLine: 'HVAC Maintenance',
        serviceType: 'Repair',
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Empty item name');
    });
  });

  describe('Pre-validation result interface', () => {
    test('should include all required fields', async () => {
      const input: ValidationInput = {
        name: 'test maintenance item',
        serviceLine: 'General',
        serviceType: 'Maintenance',
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('reasons');
      expect(Array.isArray(result.reasons)).toBe(true);
      expect(['APPROVED', 'REJECTED', 'NEEDS_REVIEW']).toContain(result.verdict);
    });

    test('should include score when available', () => {
      const input: ValidationInput = {
        name: 'pipe fitting',
      };

      const result = preValidateItem(input);
      
      expect(result).toHaveProperty('score');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });
});