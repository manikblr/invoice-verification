/**
 * Color-coded policy decision badge component
 * Displays ALLOW/DENY/NEEDS_MORE_INFO status with appropriate styling
 */

interface DecisionBadgeProps {
  /** Policy decision to display */
  policy: 'ALLOW' | 'DENY' | 'NEEDS_MORE_INFO';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Renders a color-coded badge for policy decisions
 * - ALLOW: green background
 * - DENY: red background  
 * - NEEDS_MORE_INFO: yellow background
 */
export function DecisionBadge({ policy, className = '' }: DecisionBadgeProps): JSX.Element {
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  
  const policyStyles = {
    ALLOW: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
    DENY: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    NEEDS_MORE_INFO: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
  } as const;

  const displayText = {
    ALLOW: 'Allow',
    DENY: 'Deny', 
    NEEDS_MORE_INFO: 'Needs Info'
  } as const;

  return (
    <span
      className={`${baseClasses} ${policyStyles[policy]} ${className}`}
      title={policy}
      aria-label={`Policy decision: ${policy}`}
    >
      {displayText[policy]}
    </span>
  );
}