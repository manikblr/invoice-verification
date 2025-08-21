/**
 * Langfuse tracing utilities for Next.js server-side instrumentation
 * Provides type-safe wrappers with automatic fallbacks when Langfuse unavailable
 */

import { env } from '@/config/env';
import { FLAGS } from '@/config/flags';

// Dynamic import to avoid bundling Langfuse in client code
let Langfuse: any = null;
let initialized = false;

/**
 * Initialize Langfuse client singleton (server-side only)
 */
async function initializeLangfuse() {
  if (initialized) return;
  initialized = true;

  try {
    // Only import if we have required environment variables
    if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
      console.log('[trace] Langfuse credentials not found, tracing disabled');
      return;
    }

    const { Langfuse: LangfuseClient } = await import('langfuse');
    Langfuse = new LangfuseClient({
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
    });

    console.log('[trace] Langfuse initialized');
  } catch (error) {
    console.warn('[trace] Failed to initialize Langfuse:', error);
    Langfuse = null;
  }
}

/**
 * No-op tracer that implements same interface as Langfuse
 */
class NoOpTracer {
  trace(options: any) {
    return new NoOpTrace(options.name);
  }
  span(options: any) {
    return new NoOpSpan(options.name);
  }
  flush() {
    return Promise.resolve();
  }
}

class NoOpTrace {
  id: string;
  
  constructor(public name: string) {
    this.id = `noop_trace_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  
  span(options: any) {
    return new NoOpSpan(options.name);
  }
  
  update() {}
  end() {}
}

class NoOpSpan {
  id: string;
  
  constructor(public name: string) {
    this.id = `noop_span_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  
  update() {}
  end() {}
}

/**
 * Get Langfuse tracer instance or no-op tracer with sampling
 */
export async function getTracer(forceTrace = false) {
  if (!FLAGS.ENABLE_LANGFUSE) {
    return new NoOpTracer();
  }
  
  // Apply sampling unless forced (e.g., for errors)
  if (!forceTrace && Math.random() > env.LANGFUSE_SAMPLE_RATE) {
    return new NoOpTracer();
  }
  
  await initializeLangfuse();
  return Langfuse || new NoOpTracer();
}

/**
 * Enhanced sanitization with PII detection and size limits
 */
function sanitizeData(data: any): any {
  if (!data) return data;
  
  if (typeof data === 'string') {
    // Check for common PII patterns
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
    
    let sanitized = data;
    if (emailRegex.test(data)) {
      sanitized = data.replace(emailRegex, '[EMAIL_REDACTED]');
    }
    if (phoneRegex.test(sanitized)) {
      sanitized = sanitized.replace(phoneRegex, '[PHONE_REDACTED]');
    }
    
    // Truncate long strings to 1k chars
    if (sanitized.length > 1000) {
      const hash = sanitized.slice(0, 8);
      return `${sanitized.slice(0, 1000)}... [truncated ${sanitized.length} chars, hash:${hash}]`;
    }
    return sanitized;
  }
  
  if (Array.isArray(data)) {
    return data.slice(0, 20).map(sanitizeData); // Limit arrays to 20 items
  }
  
  if (typeof data === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Redact sensitive fields
      const lowerKey = key.toLowerCase();
      if (['description', 'reason', 'email', 'address', 'phone', 'prompt', 'context'].includes(lowerKey)) {
        if (typeof value === 'string') {
          sanitized[`${key}_hash`] = value.slice(0, 12) + '...';
          sanitized[`${key}_length`] = value.length;
          sanitized[`${key}_words`] = value.split(/\s+/).length;
        } else {
          sanitized[`${key}_type`] = typeof value;
        }
      } else {
        sanitized[key] = sanitizeData(value);
      }
    }
    return sanitized;
  }
  
  return data;
}

/**
 * Start a trace for an agent run with unified ID
 */
export async function startRunTrace(params: {
  invoiceId: string;
  vendorId: string;
  serviceType?: string;
  serviceLine?: string;
  runMode?: 'dry' | 'apply';
  traceId?: string; // Optional pre-generated trace ID
  isError?: boolean; // Force tracing for errors
}) {
  const forceTrace = params.isError && env.TRACE_ONLY_ERRORS;
  const tracer = await getTracer(forceTrace);
  
  const metadata = {
    invoiceId: params.invoiceId,
    vendorId_hash: params.vendorId.slice(0, 8) + '...', // Hash vendor ID
    serviceType: params.serviceType,
    serviceLine: params.serviceLine,
    runMode: params.runMode || 'dry',
    env: process.env.NODE_ENV || 'development',
  };
  
  const trace = tracer.trace({
    name: 'AgentRun',
    id: params.traceId, // Use provided trace ID for unification
    metadata: sanitizeData(metadata),
    tags: ['agent', 'invoice-verification'],
  });
  
  return {
    trace,
    finish: () => {
      trace.end();
      return tracer.flush();
    }
  };
}

/**
 * Create a span for line decision processing
 */
export function createLineSpan(trace: any, params: {
  lineId: string;
  policy: string;
  canonicalItemId?: string;
  priceBand?: { min: number; max: number };
  reasons: string[];
  candidatesCount?: number;
}) {
  const metadata = {
    lineId: params.lineId,
    policy: params.policy,
    canonicalItemId: params.canonicalItemId,
    priceBand: params.priceBand,
    candidatesCount: params.candidatesCount,
    reasonsCount: params.reasons.length,
    // Sanitize reasons - just include first 50 chars of each
    reasonsSample: params.reasons.map(r => r.slice(0, 50) + (r.length > 50 ? '...' : '')),
  };
  
  return trace.span({
    name: 'LineDecision',
    metadata: sanitizeData(metadata),
  });
}

/**
 * Create a span for judge scores
 */
export function createJudgeSpan(trace: any, params: {
  policyScore: number;
  priceCheckScore: number;
  explanationScore: number;
  promptVersion?: string;
}) {
  const metadata = {
    policyScore: Math.round(params.policyScore * 100) / 100, // Round to 2 decimals
    priceCheckScore: Math.round(params.priceCheckScore * 100) / 100,
    explanationScore: Math.round(params.explanationScore * 100) / 100,
    promptVersion: params.promptVersion || 'v1',
  };
  
  return trace.span({
    name: 'JudgeScores',
    metadata,
  });
}

/**
 * Create a span for LLM agent calls
 */
export function createAgentSpan(trace: any, params: {
  agentName: 'ItemMatcher' | 'PriceLearner' | 'RuleApplier';
  inputTokens?: number;
  outputTokens?: number;
  promptId?: string;
}) {
  const metadata = {
    agentName: params.agentName,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    promptId: params.promptId || 'default',
  };
  
  return trace.span({
    name: params.agentName,
    metadata,
  });
}

/**
 * Extract trace ID from trace object
 */
export function getTraceId(trace: any): string | null {
  if (!trace) return null;
  
  if (trace.id) return trace.id;
  if (trace.trace_id) return trace.trace_id;
  
  // Fallback for no-op traces
  return trace.id || null;
}