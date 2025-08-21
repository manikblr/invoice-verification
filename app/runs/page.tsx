import { Metadata } from 'next';
import { PUBLIC_CFG } from '@/config/public';
import { createClient } from '@supabase/supabase-js';
import RunsTable from './components/RunsTable';

export const metadata: Metadata = {
  title: 'Agent Runs - Invoice Verification',
  description: 'Recent agent run traces and observability data',
};

interface AgentRun {
  id: string;
  invoice_id: string;
  created_at: string;
  stage: string;
  payload: {
    vendor_id?: string;
    line_count?: number;
    trace_id?: string;
    avg_policy_score?: number;
    avg_price_check_score?: number;
    avg_explanation_score?: number;
  };
}

async function getRecentRuns(): Promise<AgentRun[]> {
  try {
    // Only fetch if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.warn('[runs] Supabase not configured');
      return [];
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase
      .from('agent_events')
      .select('id, invoice_id, created_at, stage, payload')
      .eq('stage', 'agent_run_complete')
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) {
      console.error('[runs] Database error:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[runs] Failed to fetch runs:', error);
    return [];
  }
}

function formatScore(score?: number): string {
  if (typeof score !== 'number') return 'N/A';
  return `${Math.round(score * 100)}%`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getLangfuseUrl(traceId: string): string {
  const baseUrl = PUBLIC_CFG.langfuseUrl;
  if (!baseUrl) return '#';
  return `${baseUrl}/trace/${traceId}`;
}

export default async function RunsPage() {
  const runs = await getRecentRuns();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Agent Runs</h1>
        <p className="text-gray-600">
          Recent agent execution traces and observability data
        </p>
      </div>

      <RunsTable initialRuns={runs} />

      <div className="mt-6 text-sm text-gray-500">
        <p>
          Showing last 25 runs with client-side filtering. Traces are automatically created for each agent execution.
        </p>
        {!PUBLIC_CFG.langfuseUrl && (
          <p className="text-amber-600 mt-2">
            ⚠️ NEXT_PUBLIC_LANGFUSE_URL not configured - trace links disabled
          </p>
        )}
      </div>
    </div>
  );
}