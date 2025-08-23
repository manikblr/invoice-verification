/**
 * HTTP utilities for API error handling
 * Provides consistent error response formatting
 */

import { NextResponse } from 'next/server';
import { CronDisabledError } from './cron';

/**
 * Standard error response shape
 */
export interface ErrorResponse {
  error: string;
  message: string;
  hint?: string;
}

/**
 * Convert any error to a standardized JSON error response
 * Maps known error types to appropriate HTTP status codes
 * 
 * @param e - The error to convert (unknown type for flexibility)
 * @param fallbackStatus - Status code when error type is unknown
 * @returns Object with status code and JSON response body
 * 
 * @example
 * ```ts
 * try {
 *   assertCronEnabled();
 *   // ... handler logic
 * } catch (error) {
 *   const { status, body } = toJsonError(error);
 *   return NextResponse.json(body, { status });
 * }
 * ```
 */
export function toJsonError(e: unknown, fallbackStatus = 500): {
  status: number;
  body: ErrorResponse;
} {
  // Handle CronDisabledError with specific 503 response
  if (e instanceof CronDisabledError) {
    return {
      status: 503,
      body: {
        error: 'CRON_DISABLED',
        message: 'Cron jobs are paused. Set CRON_ENABLED=true to enable.',
        hint: 'Flip the env var and redeploy.'
      }
    };
  }
  
  // Handle standard Error objects
  if (e instanceof Error) {
    return {
      status: fallbackStatus,
      body: {
        error: e.name || 'INTERNAL_ERROR',
        message: e.message || 'An unexpected error occurred'
      }
    };
  }
  
  // Handle string errors
  if (typeof e === 'string') {
    return {
      status: fallbackStatus,
      body: {
        error: 'INTERNAL_ERROR',
        message: e
      }
    };
  }
  
  // Handle unknown error types
  return {
    status: fallbackStatus,
    body: {
      error: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred'
    }
  };
}

/**
 * Create a standardized error NextResponse
 * Convenience wrapper around toJsonError
 * 
 * @param e - The error to convert
 * @param fallbackStatus - Status code when error type is unknown  
 * @returns NextResponse with JSON error body and appropriate status
 */
export function errorResponse(e: unknown, fallbackStatus = 500): NextResponse<ErrorResponse> {
  const { status, body } = toJsonError(e, fallbackStatus);
  return NextResponse.json(body, { status });
}