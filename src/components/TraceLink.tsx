/**
 * Link component for Langfuse trace observability
 * Only renders when both Langfuse URL and trace ID are available
 */

import { PUBLIC_CFG } from '@/config/public';

interface TraceLinkProps {
  /** Langfuse trace ID */
  traceId?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Renders a link to view trace details in Langfuse
 * - Only shows when NEXT_PUBLIC_LANGFUSE_URL is configured and traceId exists
 * - Opens in new tab with proper security attributes
 * - Returns null if requirements not met
 */
export function TraceLink({ traceId, className = '' }: TraceLinkProps): JSX.Element | null {
  // Only render if both URL and trace ID are available
  if (!PUBLIC_CFG.langfuseUrl || !traceId) {
    return null;
  }

  // Construct the trace URL - assuming Langfuse trace URL format
  const traceUrl = `${PUBLIC_CFG.langfuseUrl}/trace/${traceId}`;

  return (
    <a
      href={traceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 focus:outline-none focus:underline ${className}`}
      title={`View trace ${traceId} in Langfuse`}
    >
      <svg
        className="w-4 h-4 mr-1.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
      <span>Open trace</span>
      <span className="sr-only">
        (opens in new tab)
      </span>
    </a>
  );
}