/**
 * Integration test for the complete enhanced pre-validation flow
 * Tests the API endpoint with service context integration
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/items/validate/route';

// Mock the OpenRouter service
const mockValidateRelevance = jest.fn();

jest.mock('../../lib/llm/openrouter-service', () => ({
  createOpenRouterService: jest.fn(() => ({
    validateRelevance: mockValidateRelevance,
  })),
}));

// Mock Supabase
const mockSupabaseInsert = jest.fn();
const mockSupabaseSelect = jest.fn();
const mockSupabaseUpdate = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: mockSupabaseInsert.mockReturnThis(),
      select: mockSupabaseSelect.mockReturnThis(),
      update: mockSupabaseUpdate.mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
  })),
}));

describe('Enhanced Pre-Validation API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful Supabase operations by default
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

  describe('Service Context Integration', () => {
    test('should use service context for GPT-5 relevance validation', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.9,
        reasoning: 'HVAC filters are essential for HVAC maintenance and perfectly align with the preventive maintenance scope'
      });

      const requestBody = {
        lineItemId: '123e4567-e89b-12d3-a456-426614174000',
        itemName: 'HVAC air filter replacement',
        itemDescription: 'High-efficiency particulate air filter for commercial HVAC system',
        serviceLine: 'HVAC Maintenance',
        serviceType: 'Preventive Maintenance',
        scopeOfWork: 'Quarterly HVAC system maintenance including filter replacement and system inspection'
      };

      const request = new NextRequest('http://localhost/api/items/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User': 'test-user',
          'X-Invoice-ID': 'test-invoice-123'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.verdict).toBe('APPROVED');
      expect(responseData.score).toBeGreaterThan(0.8);
      
      // Verify GPT-5 was called with correct service context
      expect(mockValidateRelevance).toHaveBeenCalledWith(
        'HVAC air filter replacement',
        'High-efficiency particulate air filter for commercial HVAC system',
        'HVAC Maintenance',
        'Preventive Maintenance',
        'Quarterly HVAC system maintenance including filter replacement and system inspection'
      );
    });

    test('should reject items that are irrelevant to service context', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: false,
        confidence: 0.9,
        reasoning: 'Office furniture is completely unrelated to electrical maintenance work and does not align with circuit installation scope'
      });

      const requestBody = {
        lineItemId: '123e4567-e89b-12d3-a456-426614174001',
        itemName: 'Office desk and chair set',
        itemDescription: 'Modern office furniture for workspace setup',
        serviceLine: 'Electrical Maintenance',
        serviceType: 'Circuit Installation',
        scopeOfWork: 'Install new electrical circuits for office expansion'
      };

      const request = new NextRequest('http://localhost/api/items/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.verdict).toBe('REJECTED');
      expect(responseData.reasons).toContain('GPT-5: Item not relevant for service context');
      
      expect(mockValidateRelevance).toHaveBeenCalledWith(
        'Office desk and chair set',
        'Modern office furniture for workspace setup',
        'Electrical Maintenance',
        'Circuit Installation',
        'Install new electrical circuits for office expansion'
      );
    });

    test('should flag borderline relevant items for review', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.65,
        reasoning: 'Cleaning supplies could be relevant for maintenance work but specificity to plumbing context is unclear'
      });

      const requestBody = {
        lineItemId: '123e4567-e89b-12d3-a456-426614174002',
        itemName: 'Industrial cleaning solution',
        itemDescription: 'Multi-purpose industrial cleaning chemical',
        serviceLine: 'Plumbing Maintenance',
        serviceType: 'Pipe Cleaning',
        scopeOfWork: 'Clean and maintain building drainage systems'
      };

      const request = new NextRequest('http://localhost/api/items/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.verdict).toBe('NEEDS_REVIEW');
      expect(responseData.score).toBe(0.65);
      expect(responseData.reasons).toContain('GPT-5: Medium confidence - requires human review');
    });
  });

  describe('Fallback Behavior', () => {
    test('should work without service context using rule-based validation only', async () => {
      const requestBody = {
        lineItemId: '123e4567-e89b-12d3-a456-426614174003',
        itemName: 'copper pipe fitting 1/2 inch',
        itemDescription: 'Standard copper pipe fitting for plumbing installations'
      };

      const request = new NextRequest('http://localhost/api/items/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.verdict).toBe('APPROVED');
      expect(responseData.reasons).toContain('Matches known FM material pattern');
      
      // GPT-5 should not be called without service context
      expect(mockValidateRelevance).not.toHaveBeenCalled();
    });

    test('should handle GPT-5 API failures gracefully', async () => {
      mockValidateRelevance.mockRejectedValue(new Error('OpenRouter API timeout'));

      const requestBody = {
        lineItemId: '123e4567-e89b-12d3-a456-426614174004',
        itemName: 'pipe wrench tool',
        serviceLine: 'Plumbing Maintenance',
        serviceType: 'Repair Work'
      };

      const request = new NextRequest('http://localhost/api/items/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.verdict).toBe('APPROVED'); // Rule-based approval
      expect(responseData.reasons).toContain('Contains 2 FM material keyword(s)');
      expect(responseData.reasons).toContain('LLM enhancement unavailable');
    });
  });

  describe('Batch Processing with Service Context', () => {
    test('should handle batch validation with mixed service contexts', async () => {
      // Mock different LLM responses for different items
      mockValidateRelevance
        .mockResolvedValueOnce({
          isRelevant: true,
          confidence: 0.9,
          reasoning: 'Electrical components align with electrical maintenance service'
        })
        .mockResolvedValueOnce({
          isRelevant: false,
          confidence: 0.85,
          reasoning: 'Personal items are not relevant for any maintenance service'
        });

      const requestBody = {
        items: [
          {
            lineItemId: '123e4567-e89b-12d3-a456-426614174005',
            itemName: 'electrical wire 14 AWG',
            serviceLine: 'Electrical Maintenance',
            serviceType: 'Wiring Repair',
            scopeOfWork: 'Replace damaged electrical wiring in building'
          },
          {
            lineItemId: '123e4567-e89b-12d3-a456-426614174006',
            itemName: 'coffee and lunch expenses',
            serviceLine: 'General Maintenance',
            serviceType: 'Routine Work'
          }
        ]
      };

      const request = new NextRequest('http://localhost/api/items/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.results).toHaveLength(2);
      
      // First item should be approved
      expect(responseData.results[0].verdict).toBe('APPROVED');
      
      // Second item should be rejected (blacklisted term)
      expect(responseData.results[1].verdict).toBe('REJECTED');
      expect(responseData.results[1].reasons).toContain('Contains blacklisted term');
      
      expect(responseData.summary.approved).toBe(1);
      expect(responseData.summary.rejected).toBe(1);
    });
  });

  describe('Enhanced Response Format', () => {
    test('should include LLM reasoning in response', async () => {
      mockValidateRelevance.mockResolvedValue({
        isRelevant: true,
        confidence: 0.85,
        reasoning: 'Safety equipment is essential for all maintenance work and aligns with the preventive maintenance scope'
      });

      const requestBody = {
        lineItemId: '123e4567-e89b-12d3-a456-426614174007',
        itemName: 'safety goggles and gloves',
        serviceLine: 'General Maintenance',
        serviceType: 'Preventive Maintenance',
        scopeOfWork: 'Monthly safety inspection and equipment maintenance'
      };

      const request = new NextRequest('http://localhost/api/items/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.verdict).toBe('APPROVED');
      
      // Check that database insert includes LLM reasoning
      expect(mockSupabaseInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          llm_reasoning: 'Safety equipment is essential for all maintenance work and aligns with the preventive maintenance scope'
        })
      );
    });
  });
});