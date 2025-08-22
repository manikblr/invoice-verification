"""
Judge LLM and Evaluation Agents for Langfuse Integration
Implements comprehensive evaluation system with multiple judge agents
"""

import json
import os
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from .langfuse_integration import get_prompt, call_llm, create_judge_evaluation, prompt_manager
except ImportError:
    from langfuse_integration import get_prompt, call_llm, create_judge_evaluation, prompt_manager

class JudgementType(Enum):
    ITEM_MATCH_QUALITY = "item_match_quality"
    PRICE_REASONABLENESS = "price_reasonableness"
    VALIDATION_ACCURACY = "validation_accuracy"
    AGENT_PERFORMANCE = "agent_performance"
    CONTENT_APPROPRIATENESS = "content_appropriateness"

@dataclass
class JudgeResult:
    score: float  # 0.0 to 1.0
    confidence: float  # 0.0 to 1.0
    reasoning: str
    recommendations: List[str]
    metadata: Dict[str, Any]
    judgement_type: JudgementType

class ItemMatchJudge:
    """Judge for evaluating item matching quality"""
    
    def __init__(self):
        self.name = "Item Match Judge"
        self.model = "gpt-4o-mini"
    
    def judge_match_quality(self, invoice_description: str, canonical_item: str, 
                           confidence: float, match_type: str) -> JudgeResult:
        """Evaluate the quality of an item match"""
        
        prompt = get_prompt("match_judge_system", 
                           invoice_description=invoice_description,
                           canonical_item=canonical_item,
                           confidence=confidence,
                           match_type=match_type)
        
        # Make LLM call for judgment
        response = call_llm(
            prompt=prompt,
            model=self.model,
            temperature=0.1,
            trace_name="match_quality_judgment",
            metadata={
                "judge_type": "item_match",
                "input_confidence": confidence,
                "match_type": match_type
            }
        )
        
        if not response:
            # Fallback judgment
            return self._fallback_match_judgment(invoice_description, canonical_item, confidence)
        
        try:
            # Parse LLM response
            import re
            json_match = re.search(r'\{[^{}]*"score"[^{}]*\}', response)
            if json_match:
                result_data = json.loads(json_match.group())
                
                recommendations = []
                if result_data.get("score", 0) < 0.7:
                    recommendations.append("Consider improving item descriptions")
                    recommendations.append("Review synonym database for this item")
                if confidence != result_data.get("score", 0):
                    recommendations.append("Algorithm confidence differs from judge assessment")
                
                # Log evaluation to Langfuse
                create_judge_evaluation(
                    name="item_match_quality",
                    input_data={
                        "invoice_description": invoice_description,
                        "canonical_item": canonical_item,
                        "algorithm_confidence": confidence
                    },
                    output_data=result_data,
                    score=result_data.get("score", 0),
                    comment=f"Match quality assessment: {result_data.get('reasoning', '')}"
                )
                
                return JudgeResult(
                    score=result_data.get("score", 0),
                    confidence=result_data.get("confidence", 0.8),
                    reasoning=result_data.get("reasoning", "LLM assessment of match quality"),
                    recommendations=recommendations,
                    metadata={
                        "algorithm_confidence": confidence,
                        "match_type": match_type,
                        "llm_model": self.model
                    },
                    judgement_type=JudgementType.ITEM_MATCH_QUALITY
                )
            
        except (json.JSONDecodeError, KeyError) as e:
            print(f"⚠️ Failed to parse judge response: {e}")
        
        return self._fallback_match_judgment(invoice_description, canonical_item, confidence)
    
    def _fallback_match_judgment(self, invoice_description: str, canonical_item: str, confidence: float) -> JudgeResult:
        """Fallback rule-based match judgment"""
        # Simple rule-based assessment
        score = confidence * 0.9  # Slightly penalize due to lack of LLM assessment
        
        return JudgeResult(
            score=score,
            confidence=0.6,
            reasoning="Rule-based assessment due to LLM unavailability",
            recommendations=["Enable LLM judge for better assessments"],
            metadata={"fallback": True, "algorithm_confidence": confidence},
            judgement_type=JudgementType.ITEM_MATCH_QUALITY
        )

class PriceJudge:
    """Judge for evaluating price reasonableness"""
    
    def __init__(self):
        self.name = "Price Reasonableness Judge"
        self.model = "gpt-4o-mini"
    
    def judge_price_reasonableness(self, item_name: str, unit_price: float, 
                                  expected_range: Optional[Tuple[float, float]] = None,
                                  market_context: str = "") -> JudgeResult:
        """Evaluate if a price is reasonable for the given item"""
        
        prompt = get_prompt("price_judge_system",
                           item_name=item_name,
                           unit_price=unit_price,
                           expected_range=expected_range,
                           market_context=market_context)
        
        response = call_llm(
            prompt=prompt,
            model=self.model,
            temperature=0.1,
            trace_name="price_reasonableness_judgment",
            metadata={
                "judge_type": "price_reasonableness",
                "unit_price": unit_price,
                "has_expected_range": expected_range is not None
            }
        )
        
        if not response:
            return self._fallback_price_judgment(item_name, unit_price, expected_range)
        
        try:
            import re
            json_match = re.search(r'\{[^{}]*"score"[^{}]*\}', response)
            if json_match:
                result_data = json.loads(json_match.group())
                
                recommendations = []
                score = result_data.get("score", 0.5)
                if score < 0.3:
                    recommendations.append("Price appears significantly out of range")
                    recommendations.append("Verify vendor pricing and market conditions")
                elif score < 0.6:
                    recommendations.append("Price may need review")
                
                create_judge_evaluation(
                    name="price_reasonableness",
                    input_data={
                        "item_name": item_name,
                        "unit_price": unit_price,
                        "expected_range": expected_range
                    },
                    output_data=result_data,
                    score=score,
                    comment=f"Price assessment: {result_data.get('reasoning', '')}"
                )
                
                return JudgeResult(
                    score=score,
                    confidence=result_data.get("confidence", 0.8),
                    reasoning=result_data.get("reasoning", "LLM assessment of price reasonableness"),
                    recommendations=recommendations,
                    metadata={
                        "unit_price": unit_price,
                        "expected_range": expected_range,
                        "llm_model": self.model
                    },
                    judgement_type=JudgementType.PRICE_REASONABLENESS
                )
                
        except (json.JSONDecodeError, KeyError) as e:
            print(f"⚠️ Failed to parse price judge response: {e}")
        
        return self._fallback_price_judgment(item_name, unit_price, expected_range)
    
    def _fallback_price_judgment(self, item_name: str, unit_price: float, 
                               expected_range: Optional[Tuple[float, float]]) -> JudgeResult:
        """Fallback rule-based price judgment"""
        if not expected_range:
            score = 0.5  # Neutral when no range available
            reasoning = "No price range available for comparison"
        else:
            min_price, max_price = expected_range
            if min_price <= unit_price <= max_price:
                score = 0.8  # Good if within range
                reasoning = f"Price ${unit_price} is within expected range ${min_price}-${max_price}"
            elif unit_price < min_price:
                variance = (min_price - unit_price) / min_price
                score = max(0.1, 0.6 - variance)
                reasoning = f"Price ${unit_price} is below expected range (${min_price}-${max_price})"
            else:  # unit_price > max_price
                variance = (unit_price - max_price) / max_price
                score = max(0.1, 0.6 - variance)
                reasoning = f"Price ${unit_price} is above expected range (${min_price}-${max_price})"
        
        return JudgeResult(
            score=score,
            confidence=0.6,
            reasoning=reasoning,
            recommendations=["Enable LLM judge for better price assessments"],
            metadata={"fallback": True, "expected_range": expected_range},
            judgement_type=JudgementType.PRICE_REASONABLENESS
        )

class ValidationJudge:
    """Judge for evaluating validation agent accuracy"""
    
    def __init__(self):
        self.name = "Validation Accuracy Judge"
        self.model = "gpt-4o-mini"
    
    def judge_validation_accuracy(self, item_name: str, item_description: str, 
                                 agent_decision: str, agent_reasoning: str,
                                 human_feedback: Optional[str] = None) -> JudgeResult:
        """Evaluate the accuracy of a validation decision"""
        
        # Create comprehensive prompt for validation judgment
        prompt = f"""You are an expert judge evaluating the accuracy of item validation decisions.

ITEM DETAILS:
Name: {item_name}
Description: {item_description}

AGENT DECISION:
Decision: {agent_decision}
Reasoning: {agent_reasoning}

HUMAN FEEDBACK: {human_feedback or "None provided"}

EVALUATION CRITERIA:
- Did the agent correctly identify inappropriate content?
- Is the classification (material/equipment/other) accurate?
- Is the reasoning sound and well-explained?
- Are there any obvious errors or oversights?

Respond with a JSON object:
{{
  "score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "detailed assessment",
  "errors_identified": ["list of any errors"],
  "strengths": ["list of strengths"]
}}"""

        response = call_llm(
            prompt=prompt,
            model=self.model,
            temperature=0.1,
            trace_name="validation_accuracy_judgment",
            metadata={
                "judge_type": "validation_accuracy",
                "agent_decision": agent_decision,
                "has_human_feedback": human_feedback is not None
            }
        )
        
        if not response:
            return self._fallback_validation_judgment(agent_decision, human_feedback)
        
        try:
            import re
            json_match = re.search(r'\{[^{}]*"score"[^{}]*\}', response)
            if json_match:
                result_data = json.loads(json_match.group())
                
                recommendations = []
                score = result_data.get("score", 0.5)
                
                if score < 0.4:
                    recommendations.append("Agent validation needs improvement")
                    recommendations.append("Consider retraining or prompt adjustment")
                
                errors = result_data.get("errors_identified", [])
                if errors:
                    recommendations.extend([f"Address error: {error}" for error in errors])
                
                create_judge_evaluation(
                    name="validation_accuracy",
                    input_data={
                        "item_name": item_name,
                        "agent_decision": agent_decision,
                        "agent_reasoning": agent_reasoning,
                        "human_feedback": human_feedback
                    },
                    output_data=result_data,
                    score=score,
                    comment=f"Validation accuracy: {result_data.get('reasoning', '')}"
                )
                
                return JudgeResult(
                    score=score,
                    confidence=result_data.get("confidence", 0.8),
                    reasoning=result_data.get("reasoning", "LLM assessment of validation accuracy"),
                    recommendations=recommendations,
                    metadata={
                        "agent_decision": agent_decision,
                        "errors_identified": errors,
                        "strengths": result_data.get("strengths", []),
                        "llm_model": self.model
                    },
                    judgement_type=JudgementType.VALIDATION_ACCURACY
                )
                
        except (json.JSONDecodeError, KeyError) as e:
            print(f"⚠️ Failed to parse validation judge response: {e}")
        
        return self._fallback_validation_judgment(agent_decision, human_feedback)
    
    def _fallback_validation_judgment(self, agent_decision: str, human_feedback: Optional[str]) -> JudgeResult:
        """Fallback validation judgment"""
        if human_feedback:
            # If human feedback suggests the agent was wrong, lower score
            if any(word in human_feedback.lower() for word in ["wrong", "incorrect", "error", "bad"]):
                score = 0.3
                reasoning = "Human feedback indicates agent error"
            elif any(word in human_feedback.lower() for word in ["right", "correct", "good", "accurate"]):
                score = 0.8
                reasoning = "Human feedback indicates agent accuracy"
            else:
                score = 0.6
                reasoning = "Human feedback provided but unclear"
        else:
            score = 0.6  # Neutral without feedback
            reasoning = "No human feedback available for validation"
        
        return JudgeResult(
            score=score,
            confidence=0.5,
            reasoning=reasoning,
            recommendations=["Enable LLM judge for better validation assessment"],
            metadata={"fallback": True, "has_human_feedback": human_feedback is not None},
            judgement_type=JudgementType.VALIDATION_ACCURACY
        )

class EvalAgentOrchestrator:
    """Orchestrates multiple judge agents for comprehensive evaluation"""
    
    def __init__(self):
        self.item_match_judge = ItemMatchJudge()
        self.price_judge = PriceJudge()
        self.validation_judge = ValidationJudge()
        
        # Enable/disable based on environment
        self.enabled = os.getenv('JUDGE_ENABLED', 'true').lower() == 'true'
        self.use_llm = os.getenv('JUDGE_USE_LLM', 'false').lower() == 'true'
        
        print(f"🔍 EvalAgentOrchestrator: enabled={self.enabled}, use_llm={self.use_llm}")
    
    def evaluate_invoice_processing(self, invoice_data: Dict[str, Any], 
                                   agent_results: Dict[str, Any]) -> Dict[str, JudgeResult]:
        """Comprehensive evaluation of invoice processing pipeline"""
        if not self.enabled:
            return {}
        
        evaluations = {}
        
        # Evaluate each line item processing
        for item_result in agent_results.get('line_items', []):
            item_id = item_result.get('line_item_id')
            
            # Item matching evaluation
            if 'match_result' in item_result:
                match_eval = self.item_match_judge.judge_match_quality(
                    invoice_description=item_result.get('description', ''),
                    canonical_item=item_result.get('canonical_name', ''),
                    confidence=item_result.get('match_confidence', 0),
                    match_type=item_result.get('match_type', 'unknown')
                )
                evaluations[f"{item_id}_match"] = match_eval
            
            # Price evaluation
            if 'price_validation' in item_result:
                price_eval = self.price_judge.judge_price_reasonableness(
                    item_name=item_result.get('canonical_name', 'Unknown'),
                    unit_price=item_result.get('unit_price', 0),
                    expected_range=item_result.get('expected_price_range')
                )
                evaluations[f"{item_id}_price"] = price_eval
        
        return evaluations
    
    def evaluate_validation_decision(self, item_data: Dict[str, Any], 
                                   validation_result: Dict[str, Any],
                                   human_feedback: Optional[str] = None) -> JudgeResult:
        """Evaluate a single validation decision"""
        if not self.enabled:
            return self._create_disabled_result()
        
        return self.validation_judge.judge_validation_accuracy(
            item_name=item_data.get('name', ''),
            item_description=item_data.get('description', ''),
            agent_decision=validation_result.get('decision', ''),
            agent_reasoning=validation_result.get('details', ''),
            human_feedback=human_feedback
        )
    
    def generate_performance_report(self, evaluations: Dict[str, JudgeResult]) -> Dict[str, Any]:
        """Generate performance report from evaluations"""
        if not evaluations:
            return {"message": "No evaluations available", "judge_enabled": self.enabled}
        
        scores_by_type = {}
        for eval_result in evaluations.values():
            judge_type = eval_result.judgement_type.value
            if judge_type not in scores_by_type:
                scores_by_type[judge_type] = []
            scores_by_type[judge_type].append(eval_result.score)
        
        report = {
            "evaluation_summary": {
                judge_type: {
                    "average_score": sum(scores) / len(scores),
                    "count": len(scores),
                    "min_score": min(scores),
                    "max_score": max(scores)
                }
                for judge_type, scores in scores_by_type.items()
            },
            "overall_score": sum(result.score for result in evaluations.values()) / len(evaluations),
            "total_evaluations": len(evaluations),
            "timestamp": datetime.utcnow().isoformat(),
            "judge_enabled": self.enabled,
            "llm_enabled": self.use_llm
        }
        
        # Add recommendations from all evaluations
        all_recommendations = []
        for result in evaluations.values():
            all_recommendations.extend(result.recommendations)
        
        # Deduplicate recommendations
        report["recommendations"] = list(set(all_recommendations))
        
        return report
    
    def _create_disabled_result(self) -> JudgeResult:
        """Create result when judge is disabled"""
        return JudgeResult(
            score=0.5,
            confidence=0.0,
            reasoning="Judge evaluation disabled",
            recommendations=["Enable judge evaluation in configuration"],
            metadata={"judge_disabled": True},
            judgement_type=JudgementType.AGENT_PERFORMANCE
        )

# Global orchestrator instance
eval_orchestrator = EvalAgentOrchestrator()

def evaluate_validation_decision(item_data: Dict[str, Any], validation_result: Dict[str, Any], 
                                human_feedback: Optional[str] = None) -> JudgeResult:
    """Convenience function for validation evaluation"""
    return eval_orchestrator.evaluate_validation_decision(item_data, validation_result, human_feedback)

def evaluate_invoice_processing(invoice_data: Dict[str, Any], agent_results: Dict[str, Any]) -> Dict[str, JudgeResult]:
    """Convenience function for invoice processing evaluation"""
    return eval_orchestrator.evaluate_invoice_processing(invoice_data, agent_results)

def generate_performance_report(evaluations: Dict[str, JudgeResult]) -> Dict[str, Any]:
    """Convenience function for performance reporting"""
    return eval_orchestrator.generate_performance_report(evaluations)

if __name__ == "__main__":
    # Test the judge agents
    print("🧪 Testing Judge Agents...")
    
    # Test item match judge
    match_judge = ItemMatchJudge()
    match_result = match_judge.judge_match_quality(
        invoice_description="1/2 inch PVC pipe",
        canonical_item="PVC Pipe - 0.5 inch",
        confidence=0.85,
        match_type="fuzzy"
    )
    print(f"Match judgment: {match_result.score:.2f} - {match_result.reasoning}")
    
    # Test validation judge
    validation_judge = ValidationJudge()
    validation_result = validation_judge.judge_validation_accuracy(
        item_name="PVC Pipe",
        item_description="1/2 inch PVC pipe for plumbing",
        agent_decision="approved",
        agent_reasoning="Valid plumbing supply",
        human_feedback="Correct decision"
    )
    print(f"Validation judgment: {validation_result.score:.2f} - {validation_result.reasoning}")
    
    # Test orchestrator
    evaluations = {
        "test_match": match_result,
        "test_validation": validation_result
    }
    report = generate_performance_report(evaluations)
    print(f"Performance report: {report['overall_score']:.2f} overall")
    
    print("✅ Judge agents test complete!")