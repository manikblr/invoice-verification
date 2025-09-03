/**
 * Web Ingest Queue System
 * Manages concurrent web scraping operations with rate limiting and error handling
 */

import { randomUUID } from 'crypto';

export interface IngestJob {
  id: string;
  lineItemId: string;
  itemName: string;
  itemDescription?: string;
  priority: number; // Higher = more urgent
  retries: number;
  maxRetries: number;
  createdAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  result?: IngestResult;
}

export interface IngestResult {
  vendor: string;
  sourceUrl: string;
  sourceSku?: string;
  itemName: string;
  unitOfMeasure?: string;
  packQty?: number;
  lastPrice?: number;
  lastPriceCurrency: string;
  availability?: any;
  raw: any;
  confidence: number;
  parseDurationMs: number;
  // For API compatibility and enhanced results
  sources?: IngestResult[];
  canonicalLinks?: Array<{ canonicalItemId: string; confidence: number }>;
  classifications?: Array<{ kind: 'material' | 'equipment'; confidence: number; reasoning: string }>;
  canonicalItems?: Array<{ id: string; canonicalName: string; kind: 'material' | 'equipment' }>;
}

export class WebIngestQueue {
  private jobs = new Map<string, IngestJob>();
  private processing = new Set<string>();
  private readonly concurrency: number;
  private readonly rateLimitMs: number;
  private lastProcessTime = 0;

  constructor(concurrency = 6, rateLimitMs = 1000) {
    this.concurrency = concurrency;
    this.rateLimitMs = rateLimitMs;
  }

  /**
   * Add a new ingest job to the queue
   */
  async addJob(
    lineItemId: string,
    itemName: string,
    itemDescription?: string,
    priority = 5
  ): Promise<string> {
    const job: IngestJob = {
      id: randomUUID(),
      lineItemId,
      itemName,
      itemDescription,
      priority,
      retries: 0,
      maxRetries: 3,
      createdAt: new Date(),
      status: 'pending',
    };

    this.jobs.set(job.id, job);
    console.log(`[Web Ingest Queue] Added job ${job.id} for item: ${itemName}`);
    
    // Start processing if we have capacity
    this.processQueue();
    
    return job.id;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): IngestJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs for a line item
   */
  getJobsForLineItem(lineItemId: string): IngestJob[] {
    const allJobs = Array.from(this.jobs.values());
    return allJobs.filter(job => job.lineItemId === lineItemId);
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      concurrency: this.concurrency,
      activeWorkers: this.processing.size,
    };
  }

  /**
   * Process the queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    // Check if we have capacity
    if (this.processing.size >= this.concurrency) {
      return;
    }

    // Get next job to process (priority-ordered)
    const allJobs = Array.from(this.jobs.values());
    const pendingJobs = allJobs
      .filter(job => job.status === 'pending')
      .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());

    if (pendingJobs.length === 0) {
      return;
    }

    // Rate limiting check
    const now = Date.now();
    if (now - this.lastProcessTime < this.rateLimitMs) {
      setTimeout(() => this.processQueue(), this.rateLimitMs - (now - this.lastProcessTime));
      return;
    }

    const job = pendingJobs[0];
    this.lastProcessTime = now;

    // Start processing this job
    this.processJob(job);

    // Try to process more jobs if we have capacity
    setTimeout(() => this.processQueue(), 100);
  }

  /**
   * Process a single ingest job
   */
  private async processJob(job: IngestJob): Promise<void> {
    try {
      job.status = 'processing';
      this.processing.add(job.id);

      console.log(`[Web Ingest Queue] Processing job ${job.id} for item: ${job.itemName}`);

      // Import and use the web ingester
      const { performWebIngest } = await import('./ingester');
      const result = await performWebIngest({
        itemName: job.itemName,
        itemDescription: job.itemDescription,
      });

      if (result && result.length > 0) {
        // Process results through enhanced database pipeline with classification
        const { processWebIngestResults } = await import('./database');
        const dbResult = await processWebIngestResults(result);

        // Take the best result (highest confidence)
        const bestResult = result.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        );

        job.result = bestResult;
        job.status = 'completed';
        
        console.log(`[Web Ingest Queue] Job ${job.id} completed with ${result.length} results:`);
        console.log(`  - ${dbResult.externalItems.length} external items saved`);
        console.log(`  - ${dbResult.canonicalItems.length} canonical items created/found`);
        console.log(`  - ${dbResult.canonicalLinks.length} links created`);
        console.log(`  - ${dbResult.classifications.length} items classified`);
        
        // Log classification summary
        const materialCount = dbResult.classifications.filter(c => c.kind === 'material').length;
        const equipmentCount = dbResult.classifications.filter(c => c.kind === 'equipment').length;
        console.log(`  - Classifications: ${materialCount} materials, ${equipmentCount} equipment`);

        // Trigger WEB_INGESTED event and matcher retry
        this.triggerWebIngestedEvent(job.lineItemId, result.length);
      } else {
        job.status = 'failed';
        job.error = 'No results found from any vendor';
        console.log(`[Web Ingest Queue] Job ${job.id} failed: no results`);
      }

    } catch (error) {
      job.retries++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (job.retries < job.maxRetries) {
        job.status = 'pending';
        job.error = `Attempt ${job.retries} failed: ${errorMessage}`;
        console.log(`[Web Ingest Queue] Job ${job.id} failed (attempt ${job.retries}/${job.maxRetries}): ${errorMessage}`);
        
        // Retry with exponential backoff
        setTimeout(() => this.processQueue(), Math.pow(2, job.retries) * 1000);
      } else {
        job.status = 'failed';
        job.error = `Max retries exceeded. Last error: ${errorMessage}`;
        console.error(`[Web Ingest Queue] Job ${job.id} permanently failed: ${errorMessage}`);
      }
    } finally {
      this.processing.delete(job.id);
      
      // Continue processing queue
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * Trigger WEB_INGESTED event after successful ingest
   */
  private async triggerWebIngestedEvent(lineItemId: string, sourcesCount: number): Promise<void> {
    try {
      const { processDomainEvent } = await import('../orchestration/orchestrator');
      
      // Fire WEB_INGESTED event to transition AWAITING_INGEST -> AWAITING_MATCH
      await processDomainEvent({
        type: 'WEB_INGESTED',
        lineItemId,
        sourcesCount,
      });
      
      console.log(`[Web Ingest Queue] Triggered WEB_INGESTED event for line item ${lineItemId} with ${sourcesCount} sources`);
    } catch (error) {
      console.error(`[Web Ingest Queue] Failed to trigger WEB_INGESTED event for ${lineItemId}:`, error);
    }
  }

  /**
   * Clean up old completed/failed jobs
   */
  cleanupOldJobs(olderThanHours = 24): number {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    const entries = Array.from(this.jobs.entries());
    for (const [jobId, job] of entries) {
      if ((job.status === 'completed' || job.status === 'failed') && 
          job.createdAt < cutoffTime) {
        this.jobs.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[Web Ingest Queue] Cleaned up ${cleanedCount} old jobs`);
    }

    return cleanedCount;
  }
}

// Singleton instance
export const webIngestQueue = new WebIngestQueue(
  parseInt(process.env.WEB_INGEST_CONCURRENCY || '6'),
  parseInt(process.env.WEB_INGEST_RATE_LIMIT_MS || '1000')
);

// Cleanup old jobs every hour
setInterval(() => {
  webIngestQueue.cleanupOldJobs(24);
}, 60 * 60 * 1000);