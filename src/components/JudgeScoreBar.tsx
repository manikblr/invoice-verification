/**
 * Horizontal progress bars for displaying judge evaluation scores
 * Shows policy, price check, and explanation quality scores (0-1 range)
 */

interface JudgeScores {
  policyScore: number;
  priceCheckScore: number;
  explanationScore: number;
}

interface JudgeScoreBarProps {
  /** Judge evaluation scores, undefined if no judge evaluation */
  judge?: JudgeScores;
  /** Additional CSS classes */
  className?: string;
}

interface ScoreBarProps {
  label: string;
  score: number;
  color: string;
}

function ScoreBar({ label, score, color }: ScoreBarProps): JSX.Element {
  const percentage = Math.round(score * 100);
  
  return (
    <div className="flex items-center space-x-3">
      <div className="w-20 text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">
        {label}
      </div>
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${percentage}%`}
        />
      </div>
      <div className="w-10 text-xs text-gray-700 dark:text-gray-300 text-right flex-shrink-0">
        {percentage}%
      </div>
    </div>
  );
}

/**
 * Displays judge evaluation scores as horizontal progress bars
 * - Policy Score: Blue bar for policy compliance
 * - Price Check: Green bar for price validation  
 * - Explanation: Purple bar for explanation quality
 * - Shows "—" when no judge data available
 */
export function JudgeScoreBar({ judge, className = '' }: JudgeScoreBarProps): JSX.Element {
  if (!judge) {
    return (
      <div className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Judge Scores:
          </span>
          <span>—</span>
        </div>
      </div>
    );
  }

  // Clamp scores to 0-1 range for safety
  const clampedScores = {
    policyScore: Math.max(0, Math.min(1, judge.policyScore)),
    priceCheckScore: Math.max(0, Math.min(1, judge.priceCheckScore)),
    explanationScore: Math.max(0, Math.min(1, judge.explanationScore))
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-3">
        Judge Evaluation Scores
      </div>
      
      <ScoreBar
        label="Policy"
        score={clampedScores.policyScore}
        color="bg-blue-500 dark:bg-blue-400"
      />
      
      <ScoreBar
        label="Price Check"
        score={clampedScores.priceCheckScore}
        color="bg-green-500 dark:bg-green-400"
      />
      
      <ScoreBar
        label="Explanation"
        score={clampedScores.explanationScore}
        color="bg-purple-500 dark:bg-purple-400"
      />
    </div>
  );
}