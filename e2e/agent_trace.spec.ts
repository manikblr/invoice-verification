import { test, expect } from '@playwright/test';

/**
 * E2E test for agent tracing functionality
 * Verifies that API responses include trace IDs
 */

test.describe('Agent Tracing', () => {
  test('agent run returns trace IDs in response', async ({ request }) => {
    // Mock agent request payload
    const mockPayload = {
      invoiceId: 'test_invoice_123',
      vendorId: 'test_vendor_456',
      items: [
        {
          id: 'line_1',
          description: 'Test office chair',
          quantity: 1,
          unit_price: 299.99,
        },
        {
          id: 'line_2', 
          description: 'Test desk lamp',
          quantity: 2,
          unit_price: 45.50,
        },
      ],
    };

    // Call agent API endpoint
    const response = await request.post('/api/agent_run_crew', {
      data: mockPayload,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return successful response
    expect(response.ok()).toBeTruthy();
    
    const responseData = await response.json();
    
    // Verify response structure
    expect(responseData).toHaveProperty('decisions');
    expect(responseData).toHaveProperty('runId');
    expect(responseData).toHaveProperty('runTraceId');
    
    // Verify runTraceId is a string
    expect(typeof responseData.runTraceId).toBe('string');
    expect(responseData.runTraceId.length).toBeGreaterThan(0);
    
    // Verify each decision has a traceId
    expect(Array.isArray(responseData.decisions)).toBeTruthy();
    for (const decision of responseData.decisions) {
      expect(decision).toHaveProperty('lineId');
      expect(decision).toHaveProperty('policy');
      expect(decision).toHaveProperty('traceId');
      expect(typeof decision.traceId).toBe('string');
      expect(decision.traceId.length).toBeGreaterThan(0);
    }
  });

  test('agent run handles errors gracefully with trace ID', async ({ request }) => {
    // Send invalid request payload
    const invalidPayload = {
      // Missing required fields
      items: 'invalid',
    };

    const response = await request.post('/api/agent_run_crew', {
      data: invalidPayload,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return error response
    expect(response.status()).toBe(400);
    
    const responseData = await response.json();
    
    // Should still include runTraceId for error tracking
    expect(responseData).toHaveProperty('error');
    expect(responseData).toHaveProperty('runTraceId');
  });

  test('agent run handles upstream 500 with proper error mapping', async ({ request }) => {
    // Mock upstream error by using invalid PYTHON_AGENT_URL
    const mockPayload = {
      invoiceId: 'test_invoice_123',
      vendorId: 'test_vendor_456',
      items: [
        {
          id: 'line_1',
          description: 'Test item',
          quantity: 1,
          unit_price: 100,
        },
      ],
    };

    // Set invalid upstream URL to trigger 502
    process.env.PYTHON_AGENT_URL = 'http://invalid-host:9999';

    const response = await request.post('/api/agent_run_crew', {
      data: mockPayload,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return 502 or 500 depending on error type
    expect([500, 502, 504].includes(response.status())).toBeTruthy();
    
    const responseData = await response.json();
    
    // Should still include runTraceId and proper error structure
    expect(responseData).toHaveProperty('error');
    expect(responseData).toHaveProperty('runTraceId');
    expect(typeof responseData.runTraceId).toBe('string');
  });
  
  test('/runs page displays recent runs', async ({ page }) => {
    // Navigate to runs page
    await page.goto('/runs');
    
    // Should load without errors
    await expect(page.locator('h1')).toContainText('Agent Runs');
    
    // Should show table headers
    await expect(page.locator('th')).toContainText('Run Time');
    await expect(page.locator('th')).toContainText('Invoice ID');
    await expect(page.locator('th')).toContainText('Trace');
    
    // Should show some content (either runs or empty state)
    const hasRuns = await page.locator('tbody tr').count() > 0;
    const hasEmptyState = await page.locator('text=No agent runs found').isVisible();
    
    expect(hasRuns || hasEmptyState).toBeTruthy();
  });
});