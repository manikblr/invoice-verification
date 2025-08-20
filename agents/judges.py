import os
import re
import hashlib
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass
from agents.tools.supabase_tool import SupabaseTool


def stable_fingerprint(description: str, vendor_id: str) -> str:
    """Create stable fingerprint for line item lookup"""
    # Normalize description: lowercase, collapse spaces
    normalized = re.sub(r'\s+', ' ', description.lower().strip())
    
    # Create stable hash
    content = f"{normalized}||{vendor_id}"
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


@dataclass
class GoldLabel:
    expected_decision: str
    expected_canonical_id: Optional[str]
    expected_policy_codes: List[str]
    note: Optional[str]


class DeterministicJudge:
    """Deterministic judge for scoring agent decisions"""
    
    def __init__(self, supabase_tool: SupabaseTool):
        self.supabase = supabase_tool
        self._gold_cache: Dict[str, Optional[GoldLabel]] = {}
    
    def _get_gold_label(self, fingerprint: str) -> Optional[GoldLabel]:
        """Get gold label for fingerprint with caching"""
        if fingerprint in self._gold_cache:
            return self._gold_cache[fingerprint]
        
        try:
            response = self.supabase.client.table('agent_golden_labels')\
                .select('*')\
                .eq('line_item_fingerprint', fingerprint)\
                .execute()
            
            if response.data:
                row = response.data[0]
                gold = GoldLabel(
                    expected_decision=row['expected_decision'],
                    expected_canonical_id=row.get('expected_canonical_id'),
                    expected_policy_codes=row.get('expected_policy_codes') or [],
                    note=row.get('note')
                )
                self._gold_cache[fingerprint] = gold
                return gold
            else:
                self._gold_cache[fingerprint] = None
                return None
                
        except Exception as e:
            self.supabase.log_event(None, None, 'JUDGE_ERROR', {
                'error': str(e),
                'operation': 'get_gold_label'
            })
            self._gold_cache[fingerprint] = None
            return None
    
    def score_decision(self, actual_decision: str, fingerprint: str) -> Optional[float]:
        """Score decision correctness: 1 if matches gold, 0 if not, None if no gold"""
        gold = self._get_gold_label(fingerprint)
        if gold is None:
            return None
        
        return 1.0 if actual_decision == gold.expected_decision else 0.0
    
    def score_policy(self, policy_codes: List[str], fingerprint: str) -> Optional[float]:
        """Score policy codes using Jaccard similarity"""
        gold = self._get_gold_label(fingerprint)
        if gold is None:
            return None
        
        actual_set = set(policy_codes)
        expected_set = set(gold.expected_policy_codes)
        
        # Jaccard similarity
        if len(actual_set) == 0 and len(expected_set) == 0:
            return 1.0
        
        intersection = actual_set & expected_set
        union = actual_set | expected_set
        
        return len(intersection) / len(union) if len(union) > 0 else 1.0
    
    def score_match(self, canonical_item_id: Optional[str], fingerprint: str) -> Optional[float]:
        """Score canonical item match correctness"""
        gold = self._get_gold_label(fingerprint)
        if gold is None:
            return None
        
        return 1.0 if canonical_item_id == gold.expected_canonical_id else 0.0
    
    def score_price_check(self, unit_price: float, price_band: Optional[Dict[str, float]], 
                         decision: str, policy_codes: List[str]) -> Optional[float]:
        """Score price check logic consistency with rules"""
        if price_band is None:
            return None
        
        min_price = price_band['min_price']
        max_price = price_band['max_price']
        
        # Apply same rules as RulesTool
        max_allowed = max_price * 1.5
        min_allowed = min_price * 0.5 if min_price > 0 else 0
        
        # Check expected policy codes based on price
        expected_codes = []
        if unit_price > max_allowed:
            expected_codes.append('PRICE_EXCEEDS_MAX_150')
        elif min_price > 0 and unit_price < min_allowed:
            expected_codes.append('PRICE_BELOW_MIN_50')
        
        # Check if decision and codes are consistent
        actual_price_codes = [code for code in policy_codes 
                             if code in ['PRICE_EXCEEDS_MAX_150', 'PRICE_BELOW_MIN_50']]
        
        # If we expected price violations
        if expected_codes:
            # Should have DENY decision and matching policy codes
            decision_correct = decision == 'DENY'
            codes_correct = set(actual_price_codes) == set(expected_codes)
            return 1.0 if (decision_correct and codes_correct) else 0.0
        else:
            # No price violations expected - should not have price policy codes
            has_price_codes = len(actual_price_codes) > 0
            return 0.0 if has_price_codes else 1.0
    
    def verdict(self, scores_dict: Dict[str, Optional[float]]) -> str:
        """Determine overall verdict from scores"""
        present_scores = [score for score in scores_dict.values() if score is not None]
        
        if not present_scores:
            return 'PASS'  # No scores to evaluate
        
        min_score = min(present_scores)
        
        if min_score < 0.6:
            return 'FAIL'
        elif min_score < 0.8:
            return 'WARN'
        else:
            return 'PASS'


class ExplanationJudge:
    """Judge for scoring explanation quality"""
    
    def __init__(self, supabase_tool: SupabaseTool):
        self.supabase = supabase_tool
        self.use_llm = os.getenv('JUDGE_USE_LLM', 'false').lower() == 'true'
    
    def score_explanation(self, text: str, policy_codes: List[str]) -> float:
        """Score explanation quality using heuristics or LLM"""
        if self.use_llm:
            return self._score_with_llm(text, policy_codes)
        else:
            return self._score_with_heuristics(text, policy_codes)
    
    def _score_with_heuristics(self, text: str, policy_codes: List[str]) -> float:
        """Simple heuristic scoring"""
        if not text:
            return 0.0
        
        score = 0.0
        
        # Length check: 30-300 chars gets base points
        length = len(text.strip())
        if 30 <= length <= 300:
            score += 0.4
        elif length > 10:
            score += 0.2
        
        # References policy codes
        text_upper = text.upper()
        referenced_codes = sum(1 for code in policy_codes if code in text_upper)
        if referenced_codes > 0:
            score += 0.3
        
        # Contains numeric information (prices, thresholds)
        import re
        has_numeric = bool(re.search(r'\d+\.?\d*', text))
        if has_numeric:
            score += 0.2
        
        # Basic structure check (complete sentences)
        has_sentence_structure = '.' in text or '!' in text or '?' in text
        if has_sentence_structure:
            score += 0.1
        
        return min(score, 1.0)
    
    def _score_with_llm(self, text: str, policy_codes: List[str]) -> float:
        """Score explanation quality using LLM"""
        try:
            from llm.client import get_llm
            
            llm_client = get_llm()
            if not llm_client.is_available():
                self.supabase.log_event(None, None, 'LLM_UNAVAILABLE', {
                    'operation': 'score_explanation',
                    'fallback_to_heuristic': True
                })
                return self._score_with_heuristics(text, policy_codes)
            
            # Create scoring prompt
            prompt = self._create_explanation_scoring_prompt(text, policy_codes)
            
            messages = [
                {
                    "role": "system",
                    "content": "You are an expert judge evaluating the quality of explanations for invoice verification decisions. Rate explanations on a scale of 0.0 to 1.0 based on clarity, accuracy, and completeness."
                },
                {
                    "role": "user", 
                    "content": prompt
                }
            ]
            
            # Call LLM
            response = llm_client.chat_completion(
                messages=messages,
                temperature=0.1,
                max_tokens=50
            )
            
            # Extract score from response
            content = response.choices[0].message.content.strip()
            score = self._extract_score_from_response(content)
            
            # Log successful LLM call (privacy-safe)
            self.supabase.log_event(None, None, 'LLM_SCORE_SUCCESS', {
                'model_alias': llm_client.get_model_alias(),
                'input_tokens': getattr(response.usage, 'prompt_tokens', 0),
                'output_tokens': getattr(response.usage, 'completion_tokens', 0),
                'score': score
            })
            
            return score
            
        except Exception as e:
            # Log error and fallback to heuristics
            self.supabase.log_event(None, None, 'LLM_SCORE_ERROR', {
                'error_type': type(e).__name__,
                'fallback_to_heuristic': True
            })
            return self._score_with_heuristics(text, policy_codes)
    
    def _create_explanation_scoring_prompt(self, text: str, policy_codes: List[str]) -> str:
        """Create prompt for LLM explanation scoring"""
        policy_context = f"Policy codes: {', '.join(policy_codes)}" if policy_codes else "No policy codes"
        
        return f"""Rate this invoice verification explanation on a scale of 0.0 to 1.0:

Explanation: "{text}"
{policy_context}

Scoring criteria:
- Clarity (0.3): Is the explanation clear and understandable?
- Accuracy (0.4): Does it correctly reference relevant policies and facts?
- Completeness (0.3): Does it provide sufficient justification for the decision?

Respond with only a decimal number between 0.0 and 1.0, no other text."""
    
    def _extract_score_from_response(self, response_text: str) -> float:
        """Extract numeric score from LLM response"""
        import re
        
        # Look for decimal number
        match = re.search(r'(\d*\.?\d+)', response_text)
        if match:
            try:
                score = float(match.group(1))
                return max(0.0, min(1.0, score))  # Clamp to [0, 1]
            except ValueError:
                pass
        
        # Fallback: return middle score
        return 0.5


class JudgeRunner:
    """Main judge runner that orchestrates scoring"""
    
    def __init__(self):
        self.enabled = os.getenv('JUDGE_ENABLED', 'true').lower() == 'true'
        self.supabase = SupabaseTool()
        self.deterministic_judge = DeterministicJudge(self.supabase)
        self.explanation_judge = ExplanationJudge(self.supabase)
    
    def judge_line_item(self, decision_data: Dict[str, Any], description: str, 
                       vendor_id: str, unit_price: float, price_band: Optional[Dict[str, float]],
                       invoice_id: str, line_item_id: str) -> Optional[Dict[str, Any]]:
        """Judge a single line item decision"""
        
        if not self.enabled:
            return None
        
        try:
            # Create fingerprint
            fingerprint = stable_fingerprint(description, vendor_id)
            
            # Extract decision components
            decision = decision_data['decision']
            policy_codes = decision_data['policy_codes']
            canonical_item_id = decision_data['canonical_item_id']
            reasons = decision_data['reasons']
            
            # Score each aspect
            scores = {
                'decision_correct': self.deterministic_judge.score_decision(decision, fingerprint),
                'policy_justified': self.deterministic_judge.score_policy(policy_codes, fingerprint),
                'match_correct': self.deterministic_judge.score_match(canonical_item_id, fingerprint),
                'price_check_correct': self.deterministic_judge.score_price_check(
                    unit_price, price_band, decision, policy_codes
                )
            }
            
            # Score explanation quality if reasons present
            reason_text = ' '.join(reasons) if reasons else ''
            if reason_text:
                scores['reason_quality'] = self.explanation_judge.score_explanation(reason_text, policy_codes)
            else:
                scores['reason_quality'] = None
            
            # Determine verdict
            verdict = self.deterministic_judge.verdict(scores)
            
            # Get gold label for expected data
            gold = self.deterministic_judge._get_gold_label(fingerprint)
            expected = None
            if gold:
                expected = {
                    'decision': gold.expected_decision,
                    'canonical_item_id': gold.expected_canonical_id,
                    'policy_codes': gold.expected_policy_codes
                }
            
            # Generate comments
            comments = self._generate_comments(scores, verdict, gold)
            
            # Save to database
            judgement_data = {
                'invoice_id': invoice_id,
                'line_item_id': line_item_id,
                'stage': 'post_decision',
                'scores': scores,
                'verdict': verdict,
                'comments': comments,
                'expected': expected
            }
            
            self.supabase.client.table('agent_judgements').insert(judgement_data).execute()
            
            # Return judgement for API response
            return {
                'scores': {k: v for k, v in scores.items() if v is not None},
                'verdict': verdict
            }
            
        except Exception as e:
            self.supabase.log_event(invoice_id, line_item_id, 'JUDGE_ERROR', {
                'error': str(e),
                'operation': 'judge_line_item'
            })
            return None
    
    def _generate_comments(self, scores: Dict[str, Optional[float]], verdict: str, 
                          gold: Optional[GoldLabel]) -> str:
        """Generate brief comments explaining the verdict"""
        comments = []
        
        if not gold:
            comments.append("No gold label available for comparison")
        
        failing_scores = [(name, score) for name, score in scores.items() 
                         if score is not None and score < 0.6]
        
        if failing_scores:
            score_names = ', '.join(name for name, _ in failing_scores)
            comments.append(f"Low scores: {score_names}")
        
        if verdict == 'PASS' and gold:
            comments.append("All available criteria met")
        
        return '; '.join(comments) if comments else verdict.lower()