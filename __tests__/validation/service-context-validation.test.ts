/**
 * Tests for service context integration in pre-validation
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { validateLineItem, ValidationRequest } from '../../lib/validation/validation-service';

// Mock the OpenRouter service
const mockValidateRelevance = jest.fn();

jest.mock('../../lib/llm/openrouter-service', () => ({
  createOpenRouterService: jest.fn(() => ({
    validateRelevance: mockValidateRelevance,
  })),
}));

// Mock Supabase client
const mockSupabaseInsert = jest.fn();
const mockSupabaseSelect = jest.fn();
const mockSupabaseUpdate = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: mockSupabaseInsert,
      select: mockSupabaseSelect,
      update: mockSupabaseUpdate,
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
  })),
}));

describe('Service Context Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful Supabase operations
    mockSupabaseInsert.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'test-event-id' }, error: null })
      })
    });
    
    mockSupabaseSelect.mockReturnValue({
      eq: () => ({
        order: () => ({
          limit: () => ({
            single: () => Promise.resolve({ data: null, error: { code: 'PGRST116' } })
          })
        })
      })
    });
    
    mockSupabaseUpdate.mockReturnValue({
      eq: () => Promise.resolve({ error: null })
    });
  });

  describe('GPT-5 Service Context Integration', () => {
    test('should validate HVAC items with service context', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.9,
        reasoning: 'HVAC filters are essential components for HVAC maintenance work and directly support the preventive maintenance service type'
      });

      const request: ValidationRequest = {
        lineItemId: '550e8400-e29b-41d4-a716-446655440000',
        itemName: 'HVAC air filter MERV 8',
        itemDescription: 'High-efficiency air filter for commercial HVAC systems',
        serviceLine: 'HVAC Maintenance',
        serviceType: 'Preventive Maintenance',
        scopeOfWork: 'Quarterly HVAC system maintenance including filter replacement, duct cleaning, and system performance check'
      };

      const result = await validateLineItem(request);

      expect(result.success).toBe(true);
      expect(result.result.verdict).toBe('APPROVED');
      expect(result.result.score).toBeGreaterThan(0.8);
      expect(result.result.llmReasoning).toContain('HVAC filters are essential');
      
      // Verify GPT-5 was called with full service context
      expect(mockValidateRelevance).toHaveBeenCalledWith(
        'HVAC air filter MERV 8',
        'High-efficiency air filter for commercial HVAC systems',
        'HVAC Maintenance',
        'Preventive Maintenance',
        'Quarterly HVAC system maintenance including filter replacement, duct cleaning, and system performance check'
      );
    });

    test('should reject items irrelevant to service context', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: false,
        confidence: 0.85,
        reasoning: 'Kitchen supplies are completely unrelated to electrical circuit installation work and do not support the service scope'
      });

      const request: ValidationRequest = {
        lineItemId: '550e8400-e29b-41d4-a716-446655440001',
        itemName: 'Commercial kitchen utensils',
        itemDescription: 'Professional grade kitchen tools and utensils',
        serviceLine: 'Electrical Maintenance',
        serviceType: 'Circuit Installation',
        scopeOfWork: 'Install new electrical circuits for office expansion project'
      };

      const result = await validateLineItem(request);

      expect(result.success).toBe(true);
      expect(result.result.verdict).toBe('REJECTED');
      expect(result.result.reasons).toContain('GPT-5: Item not relevant for service context');
      expect(result.result.llmReasoning).toContain('Kitchen supplies are completely unrelated');
    });

    test('should flag borderline cases for review', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.6,
        reasoning: 'Generic maintenance supplies could be relevant but specificity to plumbing work is unclear without more context'
      });

      const request: ValidationRequest = {
        lineItemId: '550e8400-e29b-41d4-a716-446655440002',
        itemName: 'Generic maintenance lubricant',
        serviceLine: 'Plumbing Maintenance',
        serviceType: 'Routine Inspection'
      };

      const result = await validateLineItem(request);

      expect(result.success).toBe(true);
      expect(result.result.verdict).toBe('NEEDS_REVIEW');
      expect(result.result.score).toBe(0.6);
      expect(result.result.reasons).toContain('GPT-5: Medium confidence - requires human review');
    });
  });

  describe('Service-Specific Context Validation', () => {
    test('should approve plumbing items for plumbing services', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.95,
        reasoning: 'Pipe fittings are fundamental plumbing materials perfectly aligned with pipe repair service and drain maintenance scope'
      });

      const request: ValidationRequest = {
        lineItemId: '550e8400-e29b-41d4-a716-446655440003',
        itemName: 'copper pipe fitting 3/4 inch',
        itemDescription: 'Standard copper pipe fitting with compression joint',
        serviceLine: 'Plumbing Maintenance',
        serviceType: 'Pipe Repair',
        scopeOfWork: 'Repair damaged water pipes and replace corroded fittings in building basement'
      };

      const result = await validateLineItem(request);

      expect(result.success).toBe(true);
      expect(result.result.verdict).toBe('APPROVED');
      expect(result.result.score).toBe(0.95);
      expect(result.result.llmReasoning).toContain('fundamental plumbing materials');
    });

    test('should reject plumbing items for electrical services', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: false,
        confidence: 0.9,
        reasoning: 'Pipe fittings are plumbing materials and have no application in electrical breaker panel work'
      });

      const request: ValidationRequest = {
        lineItemId: '550e8400-e29b-41d4-a716-446655440004',
        itemName: 'PVC pipe elbow joint',
        serviceLine: 'Electrical Maintenance',
        serviceType: 'Breaker Panel Service'
      };

      const result = await validateLineItem(request);

      expect(result.success).toBe(true);
      expect(result.result.verdict).toBe('REJECTED');
      expect(result.result.reasons).toContain('GPT-5: Item not relevant for service context');
    });

    test('should consider scope of work in decision making', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.85,
        reasoning: 'Safety equipment is appropriate for all maintenance work, especially for working with potentially hazardous materials during asbestos inspection'
      });

      const request: ValidationRequest = {
        lineItemId: '550e8400-e29b-41d4-a716-446655440005',
        itemName: 'N95 respirator masks',
        serviceLine: 'General Maintenance',
        serviceType: 'Safety Inspection',
        scopeOfWork: 'Conduct building safety inspection including asbestos testing and air quality assessment'
      };

      const result = await validateLineItem(request);

      expect(result.success).toBe(true);
      expect(result.result.verdict).toBe('APPROVED');
      expect(result.result.llmReasoning).toContain('asbestos inspection');
      
      expect(mockValidateRelevance).toHaveBeenCalledWith(
        'N95 respirator masks',
        undefined,
        'General Maintenance',
        'Safety Inspection',
        'Conduct building safety inspection including asbestos testing and air quality assessment'
      );
    });
  });

  describe('Fallback and Error Handling', () => {
    test('should work without service context', async () => {
      const request: ValidationRequest = {
        lineItemId: '550e8400-e29b-41d4-a716-446655440006',
        itemName: 'electrical wire 12 AWG'
      };

      const result = await validateLineItem(request);

      expect(result.success).toBe(true);
      expect(result.result.verdict).toBe('APPROVED');
      expect(result.result.reasons).toContain('Contains 2 FM material keyword(s)');
      
      // Should not call GPT-5 without service context
      expect(mockValidateRelevance).not.toHaveBeenCalled();
    });

    test('should handle GPT-5 API failures gracefully', async () => {
      mockValidateRelevance.mockRejectedValue(new Error('API timeout'));

      const request: ValidationRequest = {
        lineItemId: '550e8400-e29b-41d4-a716-446655440007',
        itemName: 'steel bolt fasteners',
        serviceLine: 'General Maintenance',
        serviceType: 'Structural Repair'
      };

      const result = await validateLineItem(request);

      expect(result.success).toBe(true);
      expect(result.result.verdict).toBe('APPROVED'); // Rule-based fallback
      expect(result.result.reasons).toContain('Contains 2 FM material keyword(s)');
      expect(result.result.reasons).toContain('LLM enhancement unavailable');
    });

    test('should prioritize rule-based rejections over LLM calls', async () => {
      const request: ValidationRequest = {
        lineItemId: '550e8400-e29b-41d4-a716-446655440008',
        itemName: 'technician hourly labor',
        serviceLine: 'HVAC Maintenance',
        serviceType: 'Equipment Repair'
      };

      const result = await validateLineItem(request);

      expect(result.success).toBe(true);
      expect(result.result.verdict).toBe('REJECTED');
      expect(result.result.reasons).toContain('Contains blacklisted term');
      expect(result.result.blacklistedTerm).toBe('labor');
      
      // Should not call GPT-5 for blacklisted items
      expect(mockValidateRelevance).not.toHaveBeenCalled();
    });
  });

  describe('Database Integration', () => {
    test('should persist LLM reasoning to database', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.8,
        reasoning: 'Cleaning supplies are appropriate for janitorial services and align with facility cleaning scope'
      });

      const request: ValidationRequest = {
        lineItemId: '550e8400-e29b-41d4-a716-446655440009',
        itemName: 'industrial floor cleaner',
        serviceLine: 'Cleaning Services',
        serviceType: 'Floor Maintenance'
      };

      await validateLineItem(request);

      // Verify LLM reasoning is included in database insert
      expect(mockSupabaseInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          llm_reasoning: 'Cleaning supplies are appropriate for janitorial services and align with facility cleaning scope'
        })
      );
    });
  });
});