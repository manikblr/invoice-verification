import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  startRunTrace, 
  createLineSpan, 
  createJudgeSpan, 
  getTraceId 
} from '@/observability/trace';
import { ZAgentRunResponse } from '@/types/agent';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

// Request validation schema
const AgentRunRequestSchema = z.object({
  invoiceId: z.string(),
  vendorId: z.string(),
  serviceTypeId: z.number().optional(),
  serviceLineId: z.number().optional(),
  items: z.array(z.object({
    id: z.string(),
    description: z.string(),
    quantity: z.number(),
    unit_price: z.number(),
  })),
});

export async function POST(request: NextRequest) {
  let runTrace;
  let isError = false;
  
  try {
    // Parse and validate request
    const body = await request.json();
    const validatedRequest = AgentRunRequestSchema.parse(body);
    
    // Generate unified trace ID for both TS and Python
    const unifiedTraceId = randomUUID();
    
    // Start root trace for the agent run
    runTrace = await startRunTrace({
      invoiceId: validatedRequest.invoiceId,
      vendorId: validatedRequest.vendorId,
      runMode: 'dry', // Default to dry run for safety
      traceId: unifiedTraceId,
    });
    
    // Call Python agent service with timeout and retry
    const pythonServiceUrl = process.env.PYTHON_AGENT_URL || 'http://localhost:5000';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout
    
    let response;
    let retryCount = 0;
    const maxRetries = 1;
    
    while (retryCount <= maxRetries) {
      try {
        response = await fetch(`${pythonServiceUrl}/api/agent_run_crew`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User': request.headers.get('X-User') || 'anonymous',
            'X-Langfuse-Trace-Id': unifiedTraceId,
            'X-Request-Id': randomUUID(),
          },
          body: JSON.stringify({
            invoice_id: validatedRequest.invoiceId,
            vendor_id: validatedRequest.vendorId,
            items: validatedRequest.items,
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        break;
        
      } catch (fetchError: any) {
        retryCount++;
        if (retryCount > maxRetries || !fetchError.message?.includes('ECONNRESET')) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
        // Brief delay before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!response.ok) {
      isError = true;
      const errorText = await response.text();
      
      // Map Python errors appropriately
      if (response.status >= 400 && response.status < 500) {
        // Client errors - pass through
        return NextResponse.json(
          { 
            error: `Upstream client error: ${response.status}`,
            message: errorText.slice(0, 200),
            runTraceId: getTraceId(runTrace.trace),
          }, 
          { status: response.status }
        );
      } else {
        // Server errors - return 502 Bad Gateway
        return NextResponse.json(
          { 
            error: 'UPSTREAM_ERROR',
            message: 'Python agent service unavailable',
            runTraceId: getTraceId(runTrace.trace),
          }, 
          { status: 502 }
        );
      }
    }
    
    const pythonResult = await response.json();
    
    // Validate response format
    const agentResponse = ZAgentRunResponse.parse(pythonResult);
    
    // Add tracing instrumentation to each decision
    const instrumentedDecisions = agentResponse.decisions.map((decision) => {
      // Create line decision span
      const lineSpan = createLineSpan(runTrace.trace, {
        lineId: decision.lineId,
        policy: decision.policy,
        canonicalItemId: decision.canonicalItemId || undefined,
        priceBand: decision.priceBand && typeof decision.priceBand.min === 'number' && typeof decision.priceBand.max === 'number' 
          ? decision.priceBand as { min: number; max: number }
          : undefined,
        reasons: decision.reasons,
      });
      
      // Add judge scores span if present
      if (decision.judge) {
        const judgeSpan = createJudgeSpan(runTrace.trace, {
          policyScore: decision.judge.policyScore,
          priceCheckScore: decision.judge.priceCheckScore,
          explanationScore: decision.judge.explanationScore,
        });
        judgeSpan.end();
      }
      
      lineSpan.end();
      
      // Add trace ID to decision
      return {
        ...decision,
        traceId: getTraceId(lineSpan),
      };
    });
    
    // Finish root trace
    await runTrace.finish();
    
    // Return response with trace IDs
    const result = {
      ...agentResponse,
      decisions: instrumentedDecisions,
      runTraceId: getTraceId(runTrace.trace),
    };
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('[agent_run_crew] Error:', error);
    isError = true;
    
    // Force tracing for errors if configured
    if (!runTrace && process.env.TRACE_ONLY_ERRORS === 'true') {
      runTrace = await startRunTrace({
        invoiceId: 'unknown',
        vendorId: 'unknown',
        isError: true,
      });
    }
    
    // Finish trace with error
    if (runTrace) {
      await runTrace.finish();
    }
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request format', 
          details: error.format(),
          runTraceId: runTrace ? getTraceId(runTrace.trace) : null,
        }, 
        { status: 400 }
      );
    }
    
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { 
          error: 'Request timeout',
          message: 'Python agent service took too long to respond',
          runTraceId: runTrace ? getTraceId(runTrace.trace) : null,
        }, 
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        runTraceId: runTrace ? getTraceId(runTrace.trace) : null,
      }, 
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    service: 'agent_run_crew',
    status: 'healthy',
    message: 'Use POST to run agent crew on invoice data'
  });
}