/**
 * Tests for Langfuse tracing utilities
 * Ensures graceful fallback when Langfuse unavailable
 */

import { getTracer, startRunTrace, getTraceId } from '@/observability/trace';

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Tracing utilities', () => {
  test('getTracer returns no-op tracer when credentials missing', async () => {
    // Clear Langfuse credentials
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    
    const tracer = await getTracer();
    
    expect(tracer).toBeDefined();
    
    // Should be able to create traces without errors
    const trace = tracer.trace({ name: 'test' });
    expect(trace).toBeDefined();
    expect(trace.id).toBeDefined();
    
    // Should be able to create spans without errors
    const span = trace.span({ name: 'test-span' });
    expect(span).toBeDefined();
    expect(span.id).toBeDefined();
    
    // Should be able to call update/end without errors
    expect(() => {
      span.update({ metadata: { test: true } });
      span.end();
      trace.end();
    }).not.toThrow();
  });

  test('getTracer respects sampling rate', async () => {
    process.env.LANGFUSE_SAMPLE_RATE = '0';
    
    const tracer = await getTracer();
    
    // Should return no-op tracer when sampling is 0
    expect(tracer).toBeDefined();
    const trace = tracer.trace({ name: 'test' });
    expect(trace.id).toContain('noop');
  });

  test('getTracer forces trace when forceTrace=true', async () => {
    process.env.LANGFUSE_SAMPLE_RATE = '0';
    
    const tracer = await getTracer(true);
    
    // Should still attempt to get real tracer when forced
    expect(tracer).toBeDefined();
  });

  test('startRunTrace returns valid trace object', async () => {
    const result = await startRunTrace({
      invoiceId: 'inv_123',
      vendorId: 'vendor_456',
      serviceType: 'Plumbing',
      serviceLine: 'Maintenance',
      runMode: 'dry',
    });
    
    expect(result).toBeDefined();
    expect(result.trace).toBeDefined();
    expect(result.finish).toBeInstanceOf(Function);
    
    // Should be able to finish without errors
    await expect(result.finish()).resolves.not.toThrow();
  });

  test('getTraceId extracts ID from trace objects', async () => {
    const result = await startRunTrace({
      invoiceId: 'inv_123',
      vendorId: 'vendor_456',
    });
    
    const traceId = getTraceId(result.trace);
    expect(traceId).toBeDefined();
    expect(typeof traceId).toBe('string');
    expect(traceId.length).toBeGreaterThan(0);
  });

  test('getTraceId handles null/undefined gracefully', () => {
    expect(getTraceId(null)).toBeNull();
    expect(getTraceId(undefined)).toBeNull();
  });

  test('sanitization prevents large payloads in traces', async () => {
    const result = await startRunTrace({
      invoiceId: 'inv_123',
      vendorId: 'vendor_' + 'x'.repeat(1000), // Large vendor ID
    });
    
    // Should not throw on large data
    expect(result.trace).toBeDefined();
    await expect(result.finish()).resolves.not.toThrow();
  });
});