/**
 * Typed API client functions with Zod validation
 * Provides type-safe access to backend endpoints
 */

import { z } from 'zod';
import { 
  AgentRunResponse, 
  ZAgentRunResponse 
} from '@/types/agent';
import { 
  Suggestion, 
  ZSuggestResponse 
} from '@/types/suggest';

// Legacy API types for backward compatibility
export interface MetaResponse {
  service_lines: Array<{ id: number; name: string }>;
  service_types: Array<{ id: number; name: string }>;
}

/**
 * Server error response structure
 */
interface ServerError {
  error: string;
  message: string;
  hint?: string;
}

/**
 * API client error with detailed information
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly serverError?: ServerError
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Typed fetch wrapper with error handling and JSON parsing
 * 
 * @param url - Request URL
 * @param init - Fetch options
 * @returns Parsed JSON response
 * @throws {ApiError} On HTTP errors or network failures
 */
async function apiFetch(url: string, init?: RequestInit): Promise<unknown> {
  const options: RequestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  };

  let response: Response;
  
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new ApiError(
      `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      0,
      url
    );
  }

  let data: unknown;
  
  try {
    data = await response.json();
  } catch (error) {
    throw new ApiError(
      `Invalid JSON response from ${url}`,
      response.status,
      url
    );
  }

  if (!response.ok) {
    // Try to extract server error details
    let serverError: ServerError | undefined;
    
    if (data && typeof data === 'object' && 'error' in data && 'message' in data) {
      serverError = data as ServerError;
    }

    const message = serverError?.message || `HTTP ${response.status}: ${response.statusText}`;
    
    throw new ApiError(
      message,
      response.status,
      url,
      serverError
    );
  }

  return data;
}

/**
 * Run agent crew on invoice data
 * 
 * @param payload - Invoice data and line items to process
 * @param init - Additional fetch options
 * @returns Validated agent run response with decisions and scores
 * @throws {ApiError} On HTTP errors, network failures, or invalid response format
 * 
 * @example
 * ```typescript
 * const result = await runAgent({
 *   invoiceId: 'inv_123',
 *   lineItems: [{ id: 'line_1', description: 'Office chair', unitPrice: 299.99 }]
 * });
 * console.log(`Processed ${result.decisions.length} line items`);
 * ```
 */
export async function runAgent(
  payload: unknown,
  init?: RequestInit
): Promise<AgentRunResponse> {
  const data = await apiFetch('/api/agent_run_crew', {
    method: 'POST',
    body: JSON.stringify(payload),
    ...init,
  });

  try {
    return ZAgentRunResponse.parse(data) as AgentRunResponse;
  } catch (error) {
    const zodError = error instanceof z.ZodError ? error.format() : error;
    throw new ApiError(
      `Invalid response from /api/agent_run_crew: ${JSON.stringify(zodError)}`,
      200,
      '/api/agent_run_crew'
    );
  }
}

/**
 * Get item suggestions for typeahead functionality
 * 
 * @param q - Search query string
 * @param vendorId - Optional vendor ID for boosted results
 * @param init - Additional fetch options
 * @returns Array of ranked suggestions
 * @throws {ApiError} On HTTP errors, network failures, or invalid response format
 * 
 * @example
 * ```typescript
 * const suggestions = await suggestItems('office chair', 'vendor_123');
 * suggestions.forEach(s => console.log(`${s.name} (score: ${s.score})`));
 * ```
 */
export async function suggestItems(
  q: string,
  vendorId?: string,
  init?: RequestInit
): Promise<Suggestion[]> {
  const params = new URLSearchParams({ q });
  if (vendorId) {
    params.set('vendorId', vendorId);
  }

  const url = `/api/suggest_items?${params.toString()}`;
  const data = await apiFetch(url, init);

  try {
    const response = ZSuggestResponse.parse(data);
    return response.suggestions as Suggestion[];
  } catch (error) {
    const zodError = error instanceof z.ZodError ? error.format() : error;
    throw new ApiError(
      `Invalid response from /api/suggest_items: ${JSON.stringify(zodError)}`,
      200,
      '/api/suggest_items'
    );
  }
}

/**
 * Type guard to check if an error is an ApiError
 * 
 * @param error - Error to check
 * @returns True if error is an ApiError instance
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Extract error message from unknown error type
 * Useful for displaying user-friendly error messages
 * 
 * @param error - Error of unknown type
 * @returns User-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.serverError?.message || error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unknown error occurred';
}

/**
 * Legacy API functions for backward compatibility
 */

// Mock implementation for getMeta
export async function getMeta(): Promise<MetaResponse> {
  return {
    service_lines: [
      { id: 1, name: 'Plumbing' },
      { id: 2, name: 'Electrical' },
      { id: 3, name: 'HVAC' },
      { id: 4, name: 'General Maintenance' },
    ],
    service_types: [
      { id: 1, name: 'Installation' },
      { id: 2, name: 'Repair' },
      { id: 3, name: 'Maintenance' },
      { id: 4, name: 'Inspection' },
    ],
  };
}

// Mock implementation for validateInvoice
export async function validateInvoice(invoiceData: any, saveEnabled?: boolean): Promise<import('@/lib/types').ValidationResponse> {
  // Process materials and equipment items
  const materials = invoiceData.materials || [];
  const equipment = invoiceData.equipment || [];
  const allItems = [...materials, ...equipment];
  
  let allowCount = 0;
  let rejectCount = 0;
  let reviewCount = 0;
  
  const lines = allItems.map((item: any, index: number) => {
    // Simple mock logic based on item characteristics
    let status: 'ALLOW' | 'NEEDS_REVIEW' | 'REJECT' = 'ALLOW';
    let reasonCodes: string[] = [];
    
    // Mock price validation
    if (item.unit_price > 15000) {
      status = 'NEEDS_REVIEW';
      reasonCodes = ['PRICE_HIGH'];
      reviewCount++;
    } else if (item.name?.toLowerCase().includes('coffee') || item.name?.toLowerCase().includes('lunch')) {
      status = 'REJECT';
      reasonCodes = ['PERSONAL_ITEM'];
      rejectCount++;
    } else {
      allowCount++;
      reasonCodes = ['VALID_ITEM'];
    }
    
    return {
      type: materials.includes(item) ? 'material' as const : 'equipment' as const,
      index,
      input: item,
      status,
      reason_codes: reasonCodes,
      match: status === 'ALLOW' ? {
        canonical: item.name,
        canonical_id: `canonical_${index}`,
        confidence: 0.95
      } : undefined,
      pricing: {
        unit_price: item.unit_price,
        currency: 'USD',
        min: item.unit_price * 0.8,
        max: item.unit_price * 1.2,
      }
    };
  });
  
  const totalLines = lines.length;
  let invoiceStatus: 'ALLOW' | 'NEEDS_REVIEW' | 'REJECT' = 'ALLOW';
  
  if (rejectCount > 0) {
    invoiceStatus = 'REJECT';
  } else if (reviewCount > 0) {
    invoiceStatus = 'NEEDS_REVIEW';
  }
  
  return {
    ok: true,
    mode: 'mock',
    invoice_status: invoiceStatus,
    invoice_id: saveEnabled ? `mock_inv_${Date.now()}` : null,
    save_warning: saveEnabled ? undefined : 'Validation run not saved (save disabled)',
    summary: {
      allow: allowCount,
      needs_review: reviewCount,
      reject: rejectCount,
      total_lines: totalLines,
    },
    lines,
  };
}

// Mock implementation for validateUnifiedInvoice
export async function validateUnifiedInvoice(invoiceData: any, saveEnabled?: boolean): Promise<import('@/lib/types').ValidationResponse> {
  return validateInvoice(invoiceData, saveEnabled);
}