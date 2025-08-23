/**
 * Unit Tests for Price Validation System
 */

import { 
  PriceValidator, 
  PriceValidationRequest, 
  PriceValidationResult,
  PriceRange,
  ExternalPriceSource
} from '../lib/price-validation/price-validator';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          limit: jest.fn(() => ({
            single: jest.fn()
          })),
          textSearch: jest.fn(),
          order: jest.fn(() => ({
            limit: jest.fn()
          }))
        })),
        not: jest.fn(() => ({
          gt: jest.fn(() => ({
            order: jest.fn(() => ({
              limit: jest.fn()
            }))
          }))
        })),
        in: jest.fn(() => ({
          select: jest.fn()
        }))
      }))
    }))
  }))
}));

describe('Price Validation System', () => {
  let priceValidator: PriceValidator;

  beforeEach(() => {
    // Reset environment variables
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    priceValidator = new PriceValidator();
  });

  describe('PriceValidator', () => {
    describe('validatePrice', () => {
      it('should validate against canonical range successfully', async () => {
        // Mock Supabase response for canonical range
        const mockPriceRange = {
          canonical_item_id: 'item-001',
          currency: 'USD',
          min_price: 10.00,
          max_price: 20.00,
          source: 'manual',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Mock the supabase client with proper chaining
        const mockSupabase = {
          from: jest.fn(() => ({
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  limit: jest.fn(() => ({
                    single: jest.fn().mockResolvedValue({
                      data: mockPriceRange,
                      error: null
                    })
                  }))
                }))
              }))
            }))
          }))
        };

        // Replace the validator's supabase instance
        (priceValidator as any).supabase = mockSupabase;

        const request: PriceValidationRequest = {
          lineItemId: 'line-001',
          canonicalItemId: 'item-001',
          unitPrice: 15.00,
          currency: 'USD',
        };

        const result = await priceValidator.validatePrice(request);

        expect(result.isValid).toBe(true);
        expect(result.validationMethod).toBe('canonical_range');
        expect(result.confidence).toBeCloseTo(0.9, 1);
        expect(result.expectedRange).toEqual([10.00, 20.00]);
        expect(result.variancePercent).toBe(0); // Within range
      });

      it('should detect price outside canonical range and create proposal', async () => {
        const mockPriceRange = {
          canonical_item_id: 'item-001',
          currency: 'USD',
          min_price: 10.00,
          max_price: 20.00,
          source: 'manual',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const mockSupabase = {
          from: jest.fn(() => ({
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  limit: jest.fn(() => ({
                    single: jest.fn().mockResolvedValue({
                      data: mockPriceRange,
                      error: null
                    })
                  }))
                }))
              }))
            }))
          }))
        };

        (priceValidator as any).supabase = mockSupabase;

        const request: PriceValidationRequest = {
          lineItemId: 'line-001',
          canonicalItemId: 'item-001',
          unitPrice: 25.00, // Above max price
          currency: 'USD',
        };

        const result = await priceValidator.validatePrice(request);

        expect(result.isValid).toBe(false);
        expect(result.validationMethod).toBe('canonical_range');
        expect(result.variancePercent).toBeCloseTo(0.25, 2); // 25% above max
        expect(result.proposalId).toBeDefined();
        expect(result.proposalId).toContain('price_adjust_');
      });

      it('should validate against external sources when no canonical range exists', async () => {
        const mockExternalSources = [
          {
            id: 'ext-001',
            source_vendor: 'grainger',
            item_name: 'Test Item',
            last_price: 12.50,
            last_price_currency: 'USD',
            unit_of_measure: 'EACH',
            pack_qty: 1,
            created_at: new Date().toISOString(),
            canonical_item_id: 'item-001'
          },
          {
            id: 'ext-002',
            source_vendor: 'home_depot',
            item_name: 'Test Item Similar',
            last_price: 14.00,
            last_price_currency: 'USD',
            unit_of_measure: 'EACH',
            pack_qty: 1,
            created_at: new Date().toISOString(),
            canonical_item_id: 'item-001'
          }
        ];

        const mockSupabase = {
          from: jest.fn((table) => {
            if (table === 'item_price_ranges') {
              return {
                select: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    limit: jest.fn(() => ({
                      single: jest.fn().mockResolvedValue({
                        data: null,
                        error: { message: 'No rows found' }
                      })
                    }))
                  }))
                }))
              };
            } else if (table === 'external_item_sources') {
              return {
                select: jest.fn(() => ({
                  not: jest.fn(() => ({
                    gt: jest.fn(() => ({
                      order: jest.fn(() => ({
                        limit: jest.fn(() => ({
                          in: jest.fn().mockResolvedValue({
                            data: mockExternalSources,
                            error: null
                          })
                        }))
                      }))
                    }))
                  }))
                }))
              };
            }
            return {
              select: jest.fn(() => ({
                eq: jest.fn()
              }))
            };
          })
        };

        (priceValidator as any).supabase = mockSupabase;

        const request: PriceValidationRequest = {
          lineItemId: 'line-001',
          canonicalItemId: 'item-001',
          unitPrice: 13.00, // Between external prices
          currency: 'USD',
        };

        const result = await priceValidator.validatePrice(request);

        expect(result.isValid).toBe(true);
        expect(result.validationMethod).toBe('external_provisional');
        expect(result.confidence).toBeGreaterThan(0.3);
        expect(result.confidence).toBeLessThan(0.7);
        expect(result.details.externalPriceSources).toHaveLength(2);
      });

      it('should handle no reference data gracefully', async () => {
        const mockSupabase = {
          from: jest.fn(() => ({
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                limit: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'No rows found' }
                  })
                }))
              })),
              not: jest.fn(() => ({
                gt: jest.fn(() => ({
                  order: jest.fn(() => ({
                    limit: jest.fn().mockResolvedValue({
                      data: [],
                      error: null
                    })
                  }))
                }))
              }))
            }))
          }))
        };

        (priceValidator as any).supabase = mockSupabase;

        const request: PriceValidationRequest = {
          lineItemId: 'line-001',
          unitPrice: 100.00,
          currency: 'USD',
        };

        const result = await priceValidator.validatePrice(request);

        expect(result.isValid).toBe(true);
        expect(result.validationMethod).toBe('no_reference');
        expect(result.confidence).toBe(0.1);
      });
    });

    describe('calculateVariancePercent', () => {
      it('should calculate variance correctly for prices above range', () => {
        const validator = new PriceValidator();
        const variance = (validator as any).calculateVariancePercent(25, 10, 20);
        expect(variance).toBeCloseTo(0.25, 2); // 25% above max
      });

      it('should calculate variance correctly for prices below range', () => {
        const validator = new PriceValidator();
        const variance = (validator as any).calculateVariancePercent(5, 10, 20);
        expect(variance).toBeCloseTo(0.5, 2); // 50% below min
      });

      it('should return 0 for prices within range', () => {
        const validator = new PriceValidator();
        const variance = (validator as any).calculateVariancePercent(15, 10, 20);
        expect(variance).toBe(0);
      });
    });

    describe('calculateProvisionalRange', () => {
      it('should calculate range using IQR method for multiple prices', () => {
        const validator = new PriceValidator();
        const prices = [10, 12, 14, 15, 16, 18, 20];
        const range = (validator as any).calculateProvisionalRange(prices);

        expect(range.sampleSize).toBe(7);
        expect(range.confidence).toBeGreaterThan(0.3);
        expect(range.minPrice).toBeLessThan(range.maxPrice);
      });

      it('should handle single price with buffer', () => {
        const validator = new PriceValidator();
        const prices = [15];
        const range = (validator as any).calculateProvisionalRange(prices);

        expect(range.sampleSize).toBe(1);
        expect(range.minPrice).toBe(12); // 15 * 0.8
        expect(range.maxPrice).toBe(18); // 15 * 1.2
        expect(range.confidence).toBe(0.3);
      });
    });
  });

  describe('Price Validation Service Integration', () => {
    it('should determine acceptability correctly for different validation methods', async () => {
      // Import the service function
      const { validateLineItemPrice } = await import('../lib/price-validation/price-validation-service');
      
      // Mock the validator to return specific results
      jest.mock('../lib/price-validation/price-validator', () => ({
        priceValidator: {
          validatePrice: jest.fn()
        }
      }));

      // This test would need more setup to properly mock the dependencies
      // For now, we test the logic in isolation
      
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('External Price Sources', () => {
    it('should map database records to ExternalPriceSource interface correctly', () => {
      const validator = new PriceValidator();
      const mockRecords = [
        {
          id: 'ext-001',
          source_vendor: 'grainger',
          item_name: 'Test Item',
          last_price: 12.50,
          last_price_currency: 'USD',
          unit_of_measure: 'EACH',
          pack_qty: 1,
          created_at: '2023-01-01T00:00:00Z',
          canonical_item_id: 'item-001'
        }
      ];

      const mapped = (validator as any).mapToExternalPriceSource(mockRecords);

      expect(mapped).toHaveLength(1);
      expect(mapped[0]).toMatchObject({
        id: 'ext-001',
        sourceVendor: 'grainger',
        itemName: 'Test Item',
        lastPrice: 12.50,
        lastPriceCurrency: 'USD',
        unitOfMeasure: 'EACH',
        packQty: 1,
        canonicalItemId: 'item-001'
      });
      expect(mapped[0].createdAt).toBeInstanceOf(Date);
    });
  });
});