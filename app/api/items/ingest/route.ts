import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { webIngestQueue } from '@/lib/web-ingest/queue';

export const runtime = 'nodejs';

// Request validation schema
const IngestRequestSchema = z.object({
  lineItemId: z.string().uuid('Invalid line item ID format'),
  itemName: z.string().min(1, 'Item name is required'),
  itemDescription: z.string().optional(),
  priority: z.number().min(1).max(10).default(5),
  vendorHints: z.array(z.string()).optional(),
});

const BatchIngestRequestSchema = z.object({
  items: z.array(IngestRequestSchema).min(1, 'At least one item is required'),
});

const IngestApiRequestSchema = z.union([
  IngestRequestSchema,
  BatchIngestRequestSchema,
]);

/**
 * POST /api/items/ingest
 * Trigger web ingestion for line items
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check if web ingest feature is enabled
    if (process.env.FEATURE_WEB_INGEST !== 'true') {
      return NextResponse.json(
        {
          success: false,
          error: 'Web ingestion feature is disabled',
          message: 'Set FEATURE_WEB_INGEST=true to enable this feature',
        },
        { status: 503 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedRequest = IngestApiRequestSchema.parse(body);

    let jobIds: string[] = [];

    // Handle single vs batch ingest requests
    if ('items' in validatedRequest) {
      // Batch ingest
      console.log(`[Ingest API] Batch ingest requested for ${validatedRequest.items.length} items`);
      
      const jobs = await Promise.all(
        validatedRequest.items.map(item => 
          webIngestQueue.addJob(
            item.lineItemId,
            item.itemName,
            item.itemDescription,
            item.priority
          )
        )
      );
      
      jobIds = jobs;
    } else {
      // Single ingest
      const singleRequest = validatedRequest as typeof IngestRequestSchema._output;
      console.log(`[Ingest API] Single ingest requested for item: ${singleRequest.itemName}`);
      
      const jobId = await webIngestQueue.addJob(
        singleRequest.lineItemId,
        singleRequest.itemName,
        singleRequest.itemDescription,
        singleRequest.priority
      );
      
      jobIds = [jobId];
    }

    const duration = Date.now() - startTime;

    // Return appropriate response
    if ('items' in validatedRequest) {
      // Batch response
      return NextResponse.json({
        success: true,
        message: `Queued ${jobIds.length} items for web ingestion`,
        jobIds,
        queueStats: webIngestQueue.getStats(),
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Single response
      return NextResponse.json({
        success: true,
        message: 'Item queued for web ingestion',
        jobId: jobIds[0],
        queueStats: webIngestQueue.getStats(),
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });
    }

  } catch (error) {
    console.error('[Ingest API] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request format',
          details: error.format(),
        },
        { status: 400 }
      );
    }

    // Generic error response
    return NextResponse.json(
      {
        success: false,
        error: 'Web ingestion service error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/items/ingest
 * Get web ingestion queue status and job information
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const lineItemId = searchParams.get('lineItemId');

    let response: any = {
      service: 'web_ingestion_queue',
      status: process.env.FEATURE_WEB_INGEST === 'true' ? 'enabled' : 'disabled',
      version: 'v1',
      queueStats: webIngestQueue.getStats(),
    };

    // Get specific job details if requested
    if (jobId) {
      const job = webIngestQueue.getJob(jobId);
      if (job) {
        response.job = {
          id: job.id,
          lineItemId: job.lineItemId,
          itemName: job.itemName,
          status: job.status,
          priority: job.priority,
          retries: job.retries,
          createdAt: job.createdAt,
          error: job.error,
          result: job.result,
        };
      } else {
        response.job = null;
        response.message = `Job ${jobId} not found`;
      }
    }

    // Get jobs for specific line item if requested
    if (lineItemId) {
      const jobs = webIngestQueue.getJobsForLineItem(lineItemId);
      response.lineItemJobs = jobs.map(job => ({
        id: job.id,
        status: job.status,
        priority: job.priority,
        retries: job.retries,
        createdAt: job.createdAt,
        error: job.error,
        result: job.result,
      }));
    }

    response.features = [
      'Queue-based web ingestion',
      'Multi-vendor support (Grainger, Home Depot)',
      'Rate limiting and retry logic',
      'Automatic canonical item linking',
      'Deterministic parsing (no LLM)',
    ];

    response.endpoints = {
      ingest: 'POST /api/items/ingest',
      status: 'GET /api/items/ingest?jobId={id}',
      lineItemJobs: 'GET /api/items/ingest?lineItemId={id}',
    };

    response.timestamp = new Date().toISOString();

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Ingest API] Status error:', error);

    return NextResponse.json(
      {
        service: 'web_ingestion_queue',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}