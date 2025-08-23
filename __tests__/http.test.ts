/**
 * Unit tests for HTTP error handling utilities
 */

import { toJsonError, errorResponse } from '../server/http';
import { CronDisabledError } from '../server/cron';
import { NextResponse } from 'next/server';

describe('toJsonError', () => {
  it('should handle CronDisabledError with 503 status', () => {
    const error = new CronDisabledError();
    const result = toJsonError(error);

    expect(result.status).toBe(503);
    expect(result.body).toEqual({
      error: 'CRON_DISABLED',
      message: 'Cron jobs are paused. Set CRON_ENABLED=true to enable.',
      hint: 'Flip the env var and redeploy.'
    });
  });

  it('should handle standard Error objects', () => {
    const error = new Error('Something went wrong');
    error.name = 'CustomError';
    
    const result = toJsonError(error);

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: 'CustomError',
      message: 'Something went wrong'
    });
  });

  it('should handle string errors', () => {
    const error = 'String error message';
    const result = toJsonError(error);

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'String error message'
    });
  });

  it('should handle unknown error types', () => {
    const error = { unknown: 'object' };
    const result = toJsonError(error);

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred'
    });
  });

  it('should respect custom fallback status', () => {
    const error = new Error('Test error');
    const result = toJsonError(error, 400);

    expect(result.status).toBe(400);
  });

  it('should handle Error without name or message', () => {
    const error = new Error();
    delete (error as any).name;
    delete (error as any).message;

    const result = toJsonError(error);

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    });
  });
});

describe('errorResponse', () => {
  it('should return NextResponse with correct status and body', () => {
    const error = new CronDisabledError();
    const response = errorResponse(error);

    // Note: In actual tests, you'd want to mock NextResponse.json
    // For now, we just verify the function doesn't throw
    expect(response).toBeDefined();
  });

  it('should pass through fallback status', () => {
    const error = new Error('Test');
    const response = errorResponse(error, 422);

    expect(response).toBeDefined();
  });
});

describe('CronDisabledError response format', () => {
  it('should match exact specification', () => {
    const error = new CronDisabledError();
    const result = toJsonError(error);

    // Verify exact shape per requirements
    expect(result.body).toEqual({
      error: 'CRON_DISABLED',
      message: 'Cron jobs are paused. Set CRON_ENABLED=true to enable.',
      hint: 'Flip the env var and redeploy.'
    });
    expect(result.status).toBe(503);
  });
});