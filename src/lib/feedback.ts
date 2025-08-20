/**
 * Human-in-the-loop feedback API client
 * Sends approval/denial decisions back to the system
 */

interface FeedbackPayload {
  lineId: string;
  action: 'APPROVE' | 'DENY' | 'REQUEST_INFO';
  note?: string;
  proposals?: unknown[];
}

interface FeedbackResponse {
  success: boolean;
  message: string;
}

/**
 * Send human feedback for a line item decision
 * 
 * @param payload - Feedback data including action and optional note
 * @returns Promise that resolves when feedback is successfully sent
 * @throws {Error} On HTTP errors or network failures
 */
export async function sendFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Use default error message if JSON parsing fails
    }
    
    throw new Error(errorMessage);
  }

  const result = await response.json();
  return result as FeedbackResponse;
}