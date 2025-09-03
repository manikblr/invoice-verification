/**
 * Tests for enhanced pre-validation with GPT-5 integration
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { preValidateItemEnhanced, ValidationInput } from '../../lib/validation/pre-validation';
import * as openRouterService from '../../lib/llm/openrouter-service';

// Mock the OpenRouter service
const mockValidateRelevance = jest.fn();

jest.mock('../../lib/llm/openrouter-service', () => ({
  createOpenRouterService: jest.fn(() => ({
    validateRelevance: mockValidateRelevance,
  })),
}));

describe('Enhanced Pre-Validation Agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rule-based rejection (no LLM needed)', () => {
    test('should reject blacklisted labor terms', async () => {
      const input: ValidationInput = {
        name: 'technician labor',
        serviceLine: 'HVAC Maintenance',
        serviceType: 'Preventive Maintenance'
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Contains blacklisted term');
      expect(mockValidateRelevance).not.toHaveBeenCalled();
    });

    test('should reject empty item names', async () => {
      const input: ValidationInput = {
        name: '',
        serviceLine: 'HVAC Maintenance',
        serviceType: 'Preventive Maintenance'
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Empty item name');
      expect(mockValidateRelevance).not.toHaveBeenCalled();
    });
  });

  describe('Rule-based approval with LLM relevance check', () => {
    test('should approve HVAC items with high LLM confidence', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.9,
        reasoning: 'HVAC filter is highly relevant for HVAC maintenance work'
      });

      const input: ValidationInput = {
        name: 'HVAC filter replacement',
        serviceLine: 'HVAC Maintenance',
        serviceType: 'Preventive Maintenance'
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('APPROVED');
      expect(result.score).toBeGreaterThanOrEqual(0.9);
      expect(result.reasons).toContain('Contains 2 FM material keyword(s)');
      expect(result.reasons).toContain('GPT-5: High confidence item relevance');
      expect(result.llmReasoning).toBe('HVAC filter is highly relevant for HVAC maintenance work');
      expect(mockValidateRelevance).toHaveBeenCalledWith(
        'HVAC filter replacement',
        undefined,
        'HVAC Maintenance',
        'Preventive Maintenance',
        undefined
      );
    });

    test('should reject rule-approved items if LLM finds them irrelevant', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: false,
        confidence: 0.8,
        reasoning: 'Pipe fittings are not typically used in electrical work'
      });

      const input: ValidationInput = {
        name: 'copper pipe fitting',
        serviceLine: 'Electrical Maintenance',
        serviceType: 'Electrical Repair'
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('Contains 2 FM material keyword(s)');
      expect(result.reasons).toContain('GPT-5: Item not relevant for service context');
      expect(result.llmReasoning).toBe('Pipe fittings are not typically used in electrical work');
    });
  });

  describe('LLM-enhanced ambiguous cases', () => {
    test('should approve ambiguous items with high LLM confidence', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.85,
        reasoning: 'Specialized cleaning solution is appropriate for commercial cleaning maintenance'
      });

      const input: ValidationInput = {
        name: 'industrial cleaning solution XZ-401',
        serviceLine: 'Cleaning Services',
        serviceType: 'Commercial Cleaning',
        scopeOfWork: 'Deep clean office building floors and surfaces'
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('APPROVED');
      expect(result.score).toBe(0.85);
      expect(result.reasons).toContain('GPT-5: High confidence item relevance');
      expect(result.llmReasoning).toBe('Specialized cleaning solution is appropriate for commercial cleaning maintenance');
    });

    test('should flag ambiguous items with medium LLM confidence for review', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.65,
        reasoning: 'Item could be relevant but context is unclear'
      });

      const input: ValidationInput = {
        name: 'maintenance kit ABC',
        serviceLine: 'General Maintenance',
        serviceType: 'Routine Inspection'
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('NEEDS_REVIEW');
      expect(result.score).toBe(0.65);
      expect(result.reasons).toContain('GPT-5: Medium confidence - requires human review');
    });

    test('should reject ambiguous items if LLM finds them irrelevant', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: false,
        confidence: 0.9,
        reasoning: 'Decorative items are not relevant for HVAC maintenance work'
      });

      const input: ValidationInput = {
        name: 'decorative wall mount',
        serviceLine: 'HVAC Maintenance',
        serviceType: 'Equipment Repair'
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('REJECTED');
      expect(result.reasons).toContain('GPT-5: Item not relevant for service context');
      expect(result.llmReasoning).toBe('Decorative items are not relevant for HVAC maintenance work');
    });
  });

  describe('Fallback behavior', () => {
    test('should fallback to rule-based result when LLM fails', async () => {
      mockValidateRelevance.mockRejectedValue(new Error('API timeout'));

      const input: ValidationInput = {
        name: 'pipe fitting 1/2 inch',
        serviceLine: 'Plumbing Maintenance',
        serviceType: 'Pipe Repair'
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('APPROVED'); // Rule-based approval
      expect(result.reasons).toContain('Matches known FM material pattern');
      expect(result.reasons).toContain('LLM enhancement unavailable');
    });

    test('should work without service context (no LLM call)', async () => {
      const input: ValidationInput = {
        name: 'copper pipe fitting'
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('APPROVED'); // Rule-based approval
      expect(result.reasons).toContain('Contains 2 FM material keyword(s)');
      expect(mockValidateRelevance).not.toHaveBeenCalled();
    });

    test('should handle LLM errors gracefully for needs review cases', async () => {
      mockValidateRelevance.mockRejectedValue(new Error('Network error'));

      const input: ValidationInput = {
        name: 'custom maintenance kit',
        serviceLine: 'General Maintenance',
        serviceType: 'Custom Work'
      };

      const result = await preValidateItemEnhanced(input);
      
      expect(result.verdict).toBe('NEEDS_REVIEW');
      expect(result.reasons).toContain('Ambiguous item - requires LLM classification');
      expect(result.reasons).toContain('LLM enhancement failed');
    });
  });

  describe('Service context integration', () => {
    test('should include scope of work in LLM validation', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.9,
        reasoning: 'Replacement parts align with boiler maintenance scope'
      });

      const input: ValidationInput = {
        name: 'boiler gasket replacement',
        serviceLine: 'HVAC Maintenance',
        serviceType: 'Equipment Repair',
        scopeOfWork: 'Annual boiler maintenance and safety inspection'
      };

      await preValidateItemEnhanced(input);
      
      expect(mockValidateRelevance).toHaveBeenCalledWith(
        'boiler gasket replacement',
        undefined,
        'HVAC Maintenance',
        'Equipment Repair',
        'Annual boiler maintenance and safety inspection'
      );
    });
  });
});