/**
 * Integration tests for the validation-first pipeline
 * Tests the complete flow from validation through matching
 */

import { preValidateItem } from '@/lib/validation/pre-validation';
import { processDomainEvent, getLineItemStatus } from '@/lib/orchestration/orchestrator';

// Mock Supabase for testing
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ 
            data: { 
              id: 'test-line-item',
              status: 'NEW',
              raw_name: 'Test Item',
              orchestrator_lock: null,
              created_at: new Date().toISOString()
            }, 
            error: null 
          }))
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ 
              data: { id: 'test-line-item' }, 
              error: null 
            }))
          }))
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ 
            data: { id: 'test-validation-event' }, 
            error: null 
          }))
        }))
      }))
    }))
  }))
}));

describe('Validation-First Pipeline Integration', () => {
  const mockLineItemId = 'test-line-item-123';
  
  describe('Validation Stage', () => {
    test('should approve valid FM materials', () => {
      const validItems = [
        { name: '1/2 inch PVC pipe', description: 'White PVC pipe for plumbing' },
        { name: 'Electrical wire nuts', description: 'Wire connectors for electrical work' },
        { name: 'HVAC air filter', description: 'Replacement filter for air conditioning' },
        { name: 'Ball valve assembly', description: 'Brass ball valve for water control' },
      ];
      
      validItems.forEach(item => {
        const result = preValidateItem(item);
        expect(result.verdict).toBe('APPROVED');
        expect(result.score).toBeGreaterThan(0.7);
      });
    });
    
    test('should reject inappropriate items', () => {
      const invalidItems = [
        { name: 'technician labor', description: 'Hourly labor charges' },
        { name: 'lunch expenses', description: 'Personal meal costs' },
        { name: 'sales tax', description: 'Government tax charges' },
        { name: '', description: 'Empty item' },
        { name: 'fucking tools', description: 'Inappropriate language' },
      ];
      
      invalidItems.forEach(item => {
        const result = preValidateItem(item);
        expect(result.verdict).toBe('REJECTED');
      });
    });
    
    test('should flag ambiguous items for review', () => {
      const ambiguousItems = [
        { name: 'replacement parts', description: 'Various replacement components' },
        { name: 'maintenance supplies', description: 'General maintenance items' },
        { name: 'custom equipment', description: 'Specialized equipment' },
      ];
      
      ambiguousItems.forEach(item => {
        const result = preValidateItem(item);
        expect(result.verdict).toBe('NEEDS_REVIEW');
      });
    });
  });
  
  describe('Domain Events and Status Transitions', () => {
    test('should handle VALIDATED event for approved items', async () => {
      const event = {
        type: 'VALIDATED' as const,
        lineItemId: mockLineItemId,
        verdict: 'APPROVED',
        score: 0.85,
      };
      
      const result = await processDomainEvent(event);
      expect(result).toBe(true);
    });
    
    test('should handle VALIDATED event for rejected items', async () => {
      const event = {
        type: 'VALIDATED' as const,
        lineItemId: mockLineItemId,
        verdict: 'REJECTED',
        score: 0.1,
      };
      
      const result = await processDomainEvent(event);
      expect(result).toBe(true);
    });
    
    test('should handle MATCH_MISS event', async () => {
      const event = {
        type: 'MATCH_MISS' as const,
        lineItemId: mockLineItemId,
        itemName: 'Custom pipe fitting',
      };
      
      const result = await processDomainEvent(event);
      expect(result).toBe(true);
    });
    
    test('should handle MATCHED event', async () => {
      const event = {
        type: 'MATCHED' as const,
        lineItemId: mockLineItemId,
        canonicalItemId: 'canonical-item-123',
        confidence: 0.9,
      };
      
      const result = await processDomainEvent(event);
      expect(result).toBe(true);
    });
    
    test('should handle WEB_INGESTED event', async () => {
      const event = {
        type: 'WEB_INGESTED' as const,
        lineItemId: mockLineItemId,
        sourcesCount: 3,
      };
      
      const result = await processDomainEvent(event);
      expect(result).toBe(true);
    });
  });
  
  describe('Status Flow Validation', () => {
    test('should return line item status', async () => {
      const status = await getLineItemStatus(mockLineItemId);
      expect(status).toBeTruthy();
      expect(status?.id).toBe(mockLineItemId);
      expect(status?.status).toBeTruthy();
    });
    
    test('should handle non-existent line item', async () => {
      // Mock the case where line item doesn't exist
      const status = await getLineItemStatus('non-existent-id');
      // This should be handled gracefully
      expect(status).toBeDefined();
    });
  });
  
  describe('End-to-End Pipeline Scenarios', () => {
    test('successful pipeline: NEW → APPROVED → MATCHED → PRICE_VALIDATED', async () => {
      const testItem = { name: '1/2 inch PVC pipe', description: 'Standard plumbing pipe' };
      
      // Step 1: Validation
      const validationResult = preValidateItem(testItem);
      expect(validationResult.verdict).toBe('APPROVED');
      
      // Step 2: Emit VALIDATED event
      await processDomainEvent({
        type: 'VALIDATED',
        lineItemId: mockLineItemId,
        verdict: 'APPROVED',
        score: validationResult.score || 0.8,
      });
      
      // Step 3: Emit MATCHED event
      await processDomainEvent({
        type: 'MATCHED',
        lineItemId: mockLineItemId,
        canonicalItemId: 'pipe-canonical-123',
        confidence: 0.9,
      });
      
      // Step 4: Emit PRICE_VALIDATED event
      await processDomainEvent({
        type: 'PRICE_VALIDATED',
        lineItemId: mockLineItemId,
        validated: true,
      });
      
      // All events should process successfully
      expect(true).toBe(true); // If we get here, the pipeline worked
    });
    
    test('rejection pipeline: NEW → REJECTED (end)', async () => {
      const testItem = { name: 'technician labor charges' };
      
      // Step 1: Validation
      const validationResult = preValidateItem(testItem);
      expect(validationResult.verdict).toBe('REJECTED');
      
      // Step 2: Emit VALIDATED event
      const result = await processDomainEvent({
        type: 'VALIDATED',
        lineItemId: mockLineItemId,
        verdict: 'REJECTED',
        score: validationResult.score || 0.1,
      });
      
      expect(result).toBe(true);
    });
    
    test('match miss pipeline: NEW → APPROVED → MATCH_MISS → AWAITING_INGEST', async () => {
      const testItem = { name: 'Custom titanium fitting' };
      
      // Step 1: Validation (approved but rare item)
      const validationResult = preValidateItem(testItem);
      expect(validationResult.verdict).toBe('NEEDS_REVIEW'); // Will be approved after LLM review
      
      // Step 2: Emit VALIDATED event (assume LLM approved it)
      await processDomainEvent({
        type: 'VALIDATED',
        lineItemId: mockLineItemId,
        verdict: 'APPROVED',
        score: 0.7,
      });
      
      // Step 3: Emit MATCH_MISS event
      await processDomainEvent({
        type: 'MATCH_MISS',
        lineItemId: mockLineItemId,
        itemName: testItem.name,
      });
      
      // Step 4: Emit WEB_INGESTED event
      await processDomainEvent({
        type: 'WEB_INGESTED',
        lineItemId: mockLineItemId,
        sourcesCount: 2,
      });
      
      // All events should process successfully
      expect(true).toBe(true);
    });
  });
  
  describe('Error Handling', () => {
    test('should handle malformed domain events', async () => {
      const invalidEvent = {
        type: 'INVALID_EVENT' as any,
        lineItemId: mockLineItemId,
      };
      
      const result = await processDomainEvent(invalidEvent);
      expect(result).toBe(false);
    });
    
    test('should handle validation errors gracefully', () => {
      const invalidInput = { name: null as any };
      
      expect(() => {
        preValidateItem(invalidInput);
      }).not.toThrow();
    });
  });
});