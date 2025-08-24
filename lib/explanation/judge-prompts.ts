/**
 * Judge Prompts for Explanation Clarity Evaluation
 * Phase 5: Rule Agent + Explanation Loop
 */

export interface JudgePromptConfig {
  promptName: string;
  version: string;
  description: string;
  systemMessage: string;
  userMessageTemplate: string;
  expectedFormat: string;
  scoringRubric: Record<string, string>;
}

/**
 * Judge prompt for evaluating explanation clarity and business appropriateness
 */
export const EXPLANATION_CLARITY_JUDGE: JudgePromptConfig = {
  promptName: 'explanation_clarity_judge_v1',
  version: '1.0.0',
  description: 'Evaluates the clarity and business appropriateness of user explanations for line items requiring additional context',
  
  systemMessage: `You are a business procurement compliance judge evaluating user explanations for invoice line items that require additional justification. Your role is to determine if explanations are clear, detailed, and provide legitimate business justification.

EVALUATION CRITERIA:

1. CLARITY (0-25 points):
   - Is the explanation clear and easy to understand?
   - Are technical terms explained appropriately?
   - Is the writing coherent and well-structured?

2. BUSINESS JUSTIFICATION (0-35 points):
   - Does the explanation provide legitimate business reasons?
   - Is the item clearly connected to business operations?
   - Are project requirements clearly stated?

3. SPECIFICITY (0-20 points):
   - Are specific details provided (quantities, timeframes, locations)?
   - Is the explanation tailored to this particular item?
   - Are context-specific needs addressed?

4. APPROPRIATENESS (0-20 points):
   - Is this a reasonable business expense?
   - Are there any red flags or concerning elements?
   - Does it align with typical business procurement?

SCORING:
- 80-100: ACCEPT (Excellent explanation with clear business justification)
- 60-79: ACCEPT (Good explanation with adequate justification) 
- 40-59: NEEDS_REVISION (Explanation needs more detail or clarity)
- 0-39: REJECT (Insufficient or inappropriate explanation)

Respond in JSON format with your evaluation.`,

  userMessageTemplate: `Please evaluate the following invoice line item explanation:

ITEM DETAILS:
- Item Name: {{itemName}}
- Quantity: {{quantity}}
- Unit Price: $` + `{{unitPrice}}` + `
- Canonical Match: {{canonicalItemId}}
- Total Cost: $` + `{{totalCost}}` + `

EXPLANATION SUBMITTED:
"{{explanationText}}"

Submitted by: {{submittedBy}}
Date: {{submissionDate}}

CONTEXT FOR EVALUATION:
{{evaluationContext}}

Please evaluate this explanation according to the scoring criteria and provide your decision.`,

  expectedFormat: `{
  "decision": "ACCEPT" | "REJECT" | "NEEDS_REVISION",
  "totalScore": number,
  "scores": {
    "clarity": number,
    "businessJustification": number, 
    "specificity": number,
    "appropriateness": number
  },
  "reasoning": "Detailed explanation of decision",
  "strengths": ["List of positive aspects"],
  "weaknesses": ["List of areas for improvement"],
  "confidence": number
}`,

  scoringRubric: {
    'clarity': 'How clear and understandable is the explanation?',
    'businessJustification': 'Does it provide legitimate business reasons?',
    'specificity': 'Are specific details and context provided?',
    'appropriateness': 'Is this a reasonable business expense?',
  },
};

/**
 * Judge prompt for evaluating explanation revisions
 */
export const EXPLANATION_REVISION_JUDGE: JudgePromptConfig = {
  promptName: 'explanation_revision_judge_v1',
  version: '1.0.0',
  description: 'Evaluates revised explanations that were previously marked as needing more detail',
  
  systemMessage: `You are evaluating a REVISED explanation that was previously rejected or marked as needing more detail. Focus on whether the user has addressed the specific concerns raised in the previous evaluation.

Your evaluation should be:
1. More lenient for good faith efforts to address concerns
2. Focused on improvement from the previous version
3. Considerate of user effort to provide additional context

Use the same scoring criteria as the initial evaluation but with additional weight given to responsiveness to feedback.`,

  userMessageTemplate: `Please evaluate this REVISED explanation:

ITEM DETAILS:
- Item Name: {{itemName}}
- Quantity: {{quantity}}  
- Unit Price: $` + `{{unitPrice}}` + `

ORIGINAL EXPLANATION:
"{{originalExplanation}}"

REVISED EXPLANATION:
"{{explanationText}}"

PREVIOUS FEEDBACK:
{{previousFeedback}}

Evaluate whether the revision adequately addresses the previous concerns.`,

  expectedFormat: `{
  "decision": "ACCEPT" | "REJECT",
  "improvementScore": number,
  "totalScore": number,
  "addressedConcerns": boolean,
  "reasoning": "Explanation focusing on improvements made",
  "confidence": number
}`,

  scoringRubric: {
    'improvementScore': 'How well does the revision address previous concerns?',
    'addressedConcerns': 'Were the specific issues from previous feedback resolved?',
  },
};

/**
 * Judge prompt for high-value item explanations (stricter evaluation)
 */
export const HIGH_VALUE_EXPLANATION_JUDGE: JudgePromptConfig = {
  promptName: 'high_value_explanation_judge_v1',
  version: '1.0.0', 
  description: 'Stricter evaluation for high-value items requiring additional scrutiny',
  
  systemMessage: `You are evaluating an explanation for a HIGH-VALUE invoice item that requires enhanced scrutiny due to cost thresholds or policy requirements.

ENHANCED CRITERIA for high-value items:

1. DETAILED JUSTIFICATION (0-30 points):
   - Comprehensive business case provided
   - Multiple stakeholder approval mentioned
   - Budget allocation clearly explained

2. COMPLIANCE DOCUMENTATION (0-25 points):
   - Appropriate approval levels mentioned
   - Policy compliance addressed
   - Vendor selection rationale provided

3. NECESSITY DEMONSTRATION (0-25 points):
   - Clear demonstration of business need
   - Alternatives considered and dismissed
   - Timeline and urgency explained

4. COST EFFECTIVENESS (0-20 points):
   - Price comparison or market research mentioned
   - Value proposition clearly articulated
   - Long-term benefits considered

THRESHOLD: High-value items require minimum 75/100 for acceptance.`,

  userMessageTemplate: `HIGH-VALUE ITEM EVALUATION:

ITEM DETAILS:
- Item Name: {{itemName}}
- Quantity: {{quantity}}
- Unit Price: $` + `{{unitPrice}}` + ` ⚠️ HIGH VALUE
- Total Cost: $` + `{{totalCost}}` + `

EXPLANATION:
"{{explanationText}}"

POLICY CONTEXT:
- Items over $` + `{{valueThreshold}}` + ` require enhanced justification
- Additional approval levels may be required
- Vendor selection rationale expected

Evaluate with enhanced scrutiny appropriate for high-value procurement.`,

  expectedFormat: `{
  "decision": "ACCEPT" | "REJECT",
  "totalScore": number,
  "meetsHighValueThreshold": boolean,
  "scores": {
    "detailedJustification": number,
    "complianceDocumentation": number,
    "necessityDemonstration": number, 
    "costEffectiveness": number
  },
  "reasoning": "Detailed evaluation for high-value item",
  "requiredActions": ["List of additional steps if needed"],
  "confidence": number
}`,

  scoringRubric: {
    'detailedJustification': 'Comprehensive business case with stakeholder input',
    'complianceDocumentation': 'Appropriate approvals and policy compliance',
    'necessityDemonstration': 'Clear business need with alternatives considered',
    'costEffectiveness': 'Value proposition and market comparison',
  },
};

/**
 * Select appropriate judge prompt based on context
 */
export function selectJudgePrompt(context: {
  isRevision?: boolean;
  isHighValue?: boolean;
  totalCost?: number;
  valueThreshold?: number;
}): JudgePromptConfig {
  
  const { isRevision, isHighValue, totalCost, valueThreshold = 5000 } = context;
  
  if (isRevision) {
    return EXPLANATION_REVISION_JUDGE;
  }
  
  if (isHighValue || (totalCost && totalCost > valueThreshold)) {
    return HIGH_VALUE_EXPLANATION_JUDGE;
  }
  
  return EXPLANATION_CLARITY_JUDGE;
}

/**
 * Build user message from template
 */
export function buildUserMessage(
  prompt: JudgePromptConfig, 
  variables: Record<string, any>
): string {
  let message = prompt.userMessageTemplate;
  
  // Replace template variables
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    message = message.replace(new RegExp(placeholder, 'g'), String(value || 'N/A'));
  }
  
  return message;
}

/**
 * Validate judge response format
 */
export function validateJudgeResponse(
  response: any, 
  prompt: JudgePromptConfig
): { isValid: boolean; errors: string[] } {
  
  const errors: string[] = [];
  
  if (!response || typeof response !== 'object') {
    errors.push('Response must be a valid JSON object');
    return { isValid: false, errors };
  }
  
  // Check required fields based on prompt type
  if (prompt === EXPLANATION_CLARITY_JUDGE || prompt === HIGH_VALUE_EXPLANATION_JUDGE) {
    if (!response.decision || !['ACCEPT', 'REJECT', 'NEEDS_REVISION'].includes(response.decision)) {
      errors.push('Decision must be ACCEPT, REJECT, or NEEDS_REVISION');
    }
    
    if (typeof response.totalScore !== 'number' || response.totalScore < 0 || response.totalScore > 100) {
      errors.push('totalScore must be a number between 0 and 100');
    }
    
    if (typeof response.confidence !== 'number' || response.confidence < 0 || response.confidence > 1) {
      errors.push('confidence must be a number between 0 and 1');
    }
  }
  
  if (prompt === EXPLANATION_REVISION_JUDGE) {
    if (!response.decision || !['ACCEPT', 'REJECT'].includes(response.decision)) {
      errors.push('Revision decision must be ACCEPT or REJECT');
    }
    
    if (typeof response.addressedConcerns !== 'boolean') {
      errors.push('addressedConcerns must be boolean');
    }
  }
  
  return { isValid: errors.length === 0, errors };
}