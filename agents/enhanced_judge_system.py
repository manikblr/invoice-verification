"""
Enhanced Judge System for Comprehensive Agent Evaluation
Provides advanced evaluation, scoring, and monitoring for all agents using Langfuse
"""

import json
import os
import asyncio
from typing import Dict, Any, List, Optional, Tuple, Union
from dataclasses import dataclass, asdict
from enum import Enum
from datetime import datetime, timedelta
import statistics
from collections import defaultdict

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from .langfuse_integration import get_prompt, call_llm, create_judge_evaluation, prompt_manager
    from .judge_agents import JudgementType, JudgeResult, eval_orchestrator
except ImportError:
    from langfuse_integration import get_prompt, call_llm, create_judge_evaluation, prompt_manager
    from judge_agents import JudgementType, JudgeResult, eval_orchestrator

class AgentType(Enum):
    ITEM_MATCHER = "item_matcher"
    PRICE_LEARNER = "price_learner"
    RULE_APPLIER = "rule_applier"
    VALIDATOR = "validator"
    CREW_ORCHESTRATOR = "crew_orchestrator"

class MetricType(Enum):
    ACCURACY = "accuracy"
    RESPONSE_TIME = "response_time"
    CONFIDENCE = "confidence"
    ERROR_RATE = "error_rate"
    THROUGHPUT = "throughput"
    COST = "cost"

@dataclass
class AgentPerformanceMetric:
    agent_type: AgentType
    metric_type: MetricType
    value: float
    timestamp: datetime
    context: Dict[str, Any]
    evaluation_id: Optional[str] = None

@dataclass
class ComprehensiveEvaluation:
    session_id: str
    agent_type: AgentType
    input_data: Dict[str, Any]
    output_data: Dict[str, Any]
    performance_metrics: List[AgentPerformanceMetric]
    judge_results: List[JudgeResult]
    overall_score: float
    confidence: float
    timestamp: datetime
    langfuse_trace_id: Optional[str] = None
    recommendations: List[str] = None

class EnhancedJudgeSystem:
    """Advanced judge system with comprehensive agent monitoring"""
    
    def __init__(self):
        self.enabled = os.getenv('JUDGE_ENABLED', 'true').lower() == 'true'
        self.use_llm = os.getenv('JUDGE_USE_LLM', 'true').lower() == 'true'
        self.session_evaluations = {}
        self.performance_history = defaultdict(list)
        
        # Judge models for different tasks (will be selected via OpenRouter)
        self.models = {
            'primary': 'judge',      # Will map to OPENROUTER_JUDGE_MODEL
            'fallback': 'fallback',  # Will map to OPENROUTER_FALLBACK_MODEL
            'analysis': 'reasoning'  # Will map to premium reasoning model
        }
        
        print(f"🔍 Enhanced Judge System: enabled={self.enabled}, llm={self.use_llm}")
    
    def create_session_evaluation(self, session_id: str, agent_type: AgentType, 
                                input_data: Dict[str, Any], trace_id: Optional[str] = None) -> str:
        """Create a new evaluation session"""
        evaluation = ComprehensiveEvaluation(
            session_id=session_id,
            agent_type=agent_type,
            input_data=input_data,
            output_data={},
            performance_metrics=[],
            judge_results=[],
            overall_score=0.0,
            confidence=0.0,
            timestamp=datetime.utcnow(),
            langfuse_trace_id=trace_id,
            recommendations=[]
        )
        
        self.session_evaluations[session_id] = evaluation
        return session_id
    
    def add_performance_metric(self, session_id: str, metric_type: MetricType, 
                             value: float, context: Dict[str, Any] = None):
        """Add a performance metric to an evaluation session"""
        if session_id not in self.session_evaluations:
            return
        
        evaluation = self.session_evaluations[session_id]
        metric = AgentPerformanceMetric(
            agent_type=evaluation.agent_type,
            metric_type=metric_type,
            value=value,
            timestamp=datetime.utcnow(),
            context=context or {},
            evaluation_id=session_id
        )
        
        evaluation.performance_metrics.append(metric)
        self.performance_history[evaluation.agent_type].append(metric)
    
    def judge_agent_output(self, session_id: str, output_data: Dict[str, Any]) -> JudgeResult:
        """Judge agent output using specialized LLM judges"""
        if session_id not in self.session_evaluations:
            return self._create_error_result("Session not found")
        
        evaluation = self.session_evaluations[session_id]
        evaluation.output_data = output_data
        
        # Route to appropriate judge based on agent type
        if evaluation.agent_type == AgentType.ITEM_MATCHER:
            return self._judge_item_matcher_output(evaluation)
        elif evaluation.agent_type == AgentType.PRICE_LEARNER:
            return self._judge_price_learner_output(evaluation)
        elif evaluation.agent_type == AgentType.RULE_APPLIER:
            return self._judge_rule_applier_output(evaluation)
        elif evaluation.agent_type == AgentType.VALIDATOR:
            return self._judge_validator_output(evaluation)
        elif evaluation.agent_type == AgentType.CREW_ORCHESTRATOR:
            return self._judge_crew_orchestrator_output(evaluation)
        else:
            return self._judge_generic_output(evaluation)
    
    def _judge_item_matcher_output(self, evaluation: ComprehensiveEvaluation) -> JudgeResult:
        """Specialized judge for item matcher agent"""
        prompt = self._create_item_matcher_judge_prompt(evaluation)
        
        response = call_llm(
            prompt=prompt,
            model=self.models['primary'],
            temperature=0.1,
            trace_name="judge_item_matcher",
            task_type="judging",
            metadata={
                "session_id": evaluation.session_id,
                "agent_type": evaluation.agent_type.value,
                "trace_id": evaluation.langfuse_trace_id
            }
        )
        
        return self._parse_judge_response(response, JudgementType.ITEM_MATCH_QUALITY, evaluation)
    
    def _judge_price_learner_output(self, evaluation: ComprehensiveEvaluation) -> JudgeResult:
        """Specialized judge for price learner agent"""
        prompt = self._create_price_learner_judge_prompt(evaluation)
        
        response = call_llm(
            prompt=prompt,
            model=self.models['primary'],
            temperature=0.1,
            trace_name="judge_price_learner",
            task_type="judging",
            metadata={
                "session_id": evaluation.session_id,
                "agent_type": evaluation.agent_type.value
            }
        )
        
        return self._parse_judge_response(response, JudgementType.PRICE_REASONABLENESS, evaluation)
    
    def _judge_rule_applier_output(self, evaluation: ComprehensiveEvaluation) -> JudgeResult:
        """Specialized judge for rule applier agent"""
        prompt = self._create_rule_applier_judge_prompt(evaluation)
        
        response = call_llm(
            prompt=prompt,
            model=self.models['primary'],
            temperature=0.1,
            trace_name="judge_rule_applier",
            task_type="judging",
            metadata={
                "session_id": evaluation.session_id,
                "agent_type": evaluation.agent_type.value
            }
        )
        
        return self._parse_judge_response(response, JudgementType.AGENT_PERFORMANCE, evaluation)
    
    def _judge_validator_output(self, evaluation: ComprehensiveEvaluation) -> JudgeResult:
        """Specialized judge for validator agent"""
        prompt = self._create_validator_judge_prompt(evaluation)
        
        response = call_llm(
            prompt=prompt,
            model=self.models['primary'],
            temperature=0.1,
            trace_name="judge_validator",
            task_type="judging",
            metadata={
                "session_id": evaluation.session_id,
                "agent_type": evaluation.agent_type.value
            }
        )
        
        return self._parse_judge_response(response, JudgementType.VALIDATION_ACCURACY, evaluation)
    
    def _judge_crew_orchestrator_output(self, evaluation: ComprehensiveEvaluation) -> JudgeResult:
        """Specialized judge for crew orchestrator"""
        prompt = self._create_crew_orchestrator_judge_prompt(evaluation)
        
        response = call_llm(
            prompt=prompt,
            model=self.models['analysis'],  # Use more powerful model for complex orchestration
            temperature=0.1,
            trace_name="judge_crew_orchestrator",
            task_type="reasoning",
            metadata={
                "session_id": evaluation.session_id,
                "agent_type": evaluation.agent_type.value
            }
        )
        
        return self._parse_judge_response(response, JudgementType.AGENT_PERFORMANCE, evaluation)
    
    def _create_item_matcher_judge_prompt(self, evaluation: ComprehensiveEvaluation) -> str:
        """Create specialized prompt for judging item matcher"""
        return f"""You are an expert judge evaluating an Item Matcher Agent's performance.

INPUT DATA:
{json.dumps(evaluation.input_data, indent=2)}

OUTPUT DATA:
{json.dumps(evaluation.output_data, indent=2)}

EVALUATION CRITERIA:
1. Match Accuracy: Did the agent correctly identify the canonical item?
2. Confidence Calibration: Is the confidence score well-calibrated?
3. Match Type Selection: Was the appropriate matching strategy used?
4. Edge Case Handling: How well were ambiguous cases handled?
5. Performance: Speed and efficiency metrics

SPECIFIC METRICS TO ASSESS:
- Semantic similarity between input and matched item
- Appropriateness of confidence score (0.0-1.0)
- Quality of synonym matching if applicable
- Handling of partial or unclear descriptions

Respond with JSON:
{{
  "score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "detailed assessment",
  "accuracy_score": 0.0-1.0,
  "confidence_calibration": 0.0-1.0,
  "efficiency_score": 0.0-1.0,
  "issues": ["any problems identified"],
  "strengths": ["positive aspects"],
  "recommendations": ["specific improvements"]
}}"""
    
    def _create_price_learner_judge_prompt(self, evaluation: ComprehensiveEvaluation) -> str:
        """Create specialized prompt for judging price learner"""
        return f"""You are an expert judge evaluating a Price Learner Agent's performance.

INPUT DATA:
{json.dumps(evaluation.input_data, indent=2)}

OUTPUT DATA:
{json.dumps(evaluation.output_data, indent=2)}

EVALUATION CRITERIA:
1. Price Validation Accuracy: Correct identification of reasonable/unreasonable prices
2. Range Adjustment Logic: Quality of proposed price range updates
3. Market Awareness: Understanding of pricing context and factors
4. Learning Effectiveness: How well the agent incorporates new pricing data
5. Risk Assessment: Appropriate flagging of pricing anomalies

SPECIFIC METRICS TO ASSESS:
- Accuracy of price reasonableness determination
- Quality of variance calculations
- Appropriateness of proposed adjustments
- Market factor consideration

Respond with JSON:
{{
  "score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "detailed assessment",
  "validation_accuracy": 0.0-1.0,
  "learning_quality": 0.0-1.0,
  "risk_assessment": 0.0-1.0,
  "issues": ["any problems identified"],
  "strengths": ["positive aspects"],
  "recommendations": ["specific improvements"]
}}"""
    
    def _create_rule_applier_judge_prompt(self, evaluation: ComprehensiveEvaluation) -> str:
        """Create specialized prompt for judging rule applier"""
        return f"""You are an expert judge evaluating a Rule Applier Agent's performance.

INPUT DATA:
{json.dumps(evaluation.input_data, indent=2)}

OUTPUT DATA:
{json.dumps(evaluation.output_data, indent=2)}

EVALUATION CRITERIA:
1. Rule Application Accuracy: Correct application of business rules
2. Decision Logic: Sound reasoning for approve/reject/review decisions
3. Policy Compliance: Adherence to organizational policies
4. Edge Case Handling: Management of complex or borderline cases
5. Explanation Quality: Clarity and completeness of decision reasoning

SPECIFIC METRICS TO ASSESS:
- Correctness of final decision
- Completeness of rule checking
- Quality of reasoning explanation
- Consistency with policy framework

Respond with JSON:
{{
  "score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "detailed assessment",
  "rule_accuracy": 0.0-1.0,
  "decision_quality": 0.0-1.0,
  "explanation_clarity": 0.0-1.0,
  "issues": ["any problems identified"],
  "strengths": ["positive aspects"],
  "recommendations": ["specific improvements"]
}}"""
    
    def _create_validator_judge_prompt(self, evaluation: ComprehensiveEvaluation) -> str:
        """Create specialized prompt for judging validator"""
        return f"""You are an expert judge evaluating a Validator Agent's performance.

INPUT DATA:
{json.dumps(evaluation.input_data, indent=2)}

OUTPUT DATA:
{json.dumps(evaluation.output_data, indent=2)}

EVALUATION CRITERIA:
1. Content Classification Accuracy: Correct identification of appropriate/inappropriate content
2. Abuse Detection: Effectiveness in catching spam, inappropriate items, or gaming attempts
3. False Positive/Negative Rate: Balance between security and usability
4. Reasoning Quality: Clear explanation of validation decisions
5. Edge Case Handling: Management of ambiguous or borderline cases

SPECIFIC METRICS TO ASSESS:
- Accuracy of approve/reject/review decisions
- Appropriateness of confidence scores
- Quality of reasoning explanations
- Consistency with validation criteria

Respond with JSON:
{{
  "score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "detailed assessment",
  "classification_accuracy": 0.0-1.0,
  "abuse_detection": 0.0-1.0,
  "reasoning_quality": 0.0-1.0,
  "issues": ["any problems identified"],
  "strengths": ["positive aspects"],
  "recommendations": ["specific improvements"]
}}"""
    
    def _create_crew_orchestrator_judge_prompt(self, evaluation: ComprehensiveEvaluation) -> str:
        """Create specialized prompt for judging crew orchestrator"""
        return f"""You are an expert judge evaluating a Crew Orchestrator's performance in managing multiple agents.

INPUT DATA:
{json.dumps(evaluation.input_data, indent=2)}

OUTPUT DATA:
{json.dumps(evaluation.output_data, indent=2)}

EVALUATION CRITERIA:
1. Orchestration Effectiveness: Quality of agent coordination and task distribution
2. Result Integration: How well individual agent outputs were combined
3. Error Handling: Management of agent failures or inconsistencies
4. Performance Optimization: Efficiency of parallel vs sequential processing
5. Output Quality: Final combined result quality and completeness

SPECIFIC METRICS TO ASSESS:
- Completeness of invoice processing
- Consistency across agent decisions
- Error recovery and fallback handling
- Overall processing efficiency

Respond with JSON:
{{
  "score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "detailed assessment",
  "orchestration_quality": 0.0-1.0,
  "result_integration": 0.0-1.0,
  "error_handling": 0.0-1.0,
  "issues": ["any problems identified"],
  "strengths": ["positive aspects"],
  "recommendations": ["specific improvements"]
}}"""
    
    def _parse_judge_response(self, response: Optional[str], judgement_type: JudgementType, 
                            evaluation: ComprehensiveEvaluation) -> JudgeResult:
        """Parse LLM judge response and create JudgeResult"""
        if not response:
            return self._create_fallback_result(judgement_type, evaluation)
        
        try:
            import re
            json_match = re.search(r'\{[^{}]*"score"[^{}]*\}', response, re.DOTALL)
            if json_match:
                result_data = json.loads(json_match.group())
                
                score = result_data.get("score", 0.5)
                confidence = result_data.get("confidence", 0.7)
                reasoning = result_data.get("reasoning", "LLM assessment")
                recommendations = result_data.get("recommendations", [])
                
                # Store evaluation in Langfuse
                create_judge_evaluation(
                    name=f"{evaluation.agent_type.value}_evaluation",
                    input_data=evaluation.input_data,
                    output_data=evaluation.output_data,
                    score=score,
                    comment=f"{judgement_type.value}: {reasoning}",
                    trace_id=evaluation.langfuse_trace_id
                )
                
                judge_result = JudgeResult(
                    score=score,
                    confidence=confidence,
                    reasoning=reasoning,
                    recommendations=recommendations,
                    metadata={
                        "session_id": evaluation.session_id,
                        "agent_type": evaluation.agent_type.value,
                        "detailed_scores": {k: v for k, v in result_data.items() 
                                         if k.endswith('_score') or k.endswith('_accuracy')},
                        "llm_model": self.models['primary']
                    },
                    judgement_type=judgement_type
                )
                
                evaluation.judge_results.append(judge_result)
                return judge_result
                
        except (json.JSONDecodeError, KeyError) as e:
            print(f"⚠️ Failed to parse judge response: {e}")
        
        return self._create_fallback_result(judgement_type, evaluation)
    
    def _create_fallback_result(self, judgement_type: JudgementType, 
                              evaluation: ComprehensiveEvaluation) -> JudgeResult:
        """Create fallback result when LLM judge fails"""
        return JudgeResult(
            score=0.6,
            confidence=0.3,
            reasoning="Fallback assessment due to LLM judge failure",
            recommendations=["Enable LLM judge for detailed evaluation"],
            metadata={"fallback": True, "session_id": evaluation.session_id},
            judgement_type=judgement_type
        )
    
    def _create_error_result(self, error_msg: str) -> JudgeResult:
        """Create error result"""
        return JudgeResult(
            score=0.0,
            confidence=0.0,
            reasoning=f"Evaluation error: {error_msg}",
            recommendations=["Check session configuration"],
            metadata={"error": True},
            judgement_type=JudgementType.AGENT_PERFORMANCE
        )
    
    def finalize_evaluation(self, session_id: str) -> ComprehensiveEvaluation:
        """Finalize evaluation and calculate overall scores"""
        if session_id not in self.session_evaluations:
            return None
        
        evaluation = self.session_evaluations[session_id]
        
        # Calculate overall score from judge results
        if evaluation.judge_results:
            scores = [result.score for result in evaluation.judge_results]
            evaluation.overall_score = statistics.mean(scores)
            evaluation.confidence = statistics.mean([result.confidence for result in evaluation.judge_results])
        
        # Aggregate recommendations
        all_recommendations = []
        for result in evaluation.judge_results:
            all_recommendations.extend(result.recommendations)
        evaluation.recommendations = list(set(all_recommendations))
        
        return evaluation
    
    def get_agent_performance_summary(self, agent_type: AgentType, 
                                    days: int = 7) -> Dict[str, Any]:
        """Get performance summary for an agent over specified days"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        recent_metrics = [m for m in self.performance_history[agent_type] 
                         if m.timestamp >= cutoff_date]
        
        if not recent_metrics:
            return {"message": f"No recent data for {agent_type.value}", "days": days}
        
        # Group by metric type
        metrics_by_type = defaultdict(list)
        for metric in recent_metrics:
            metrics_by_type[metric.metric_type].append(metric.value)
        
        summary = {
            "agent_type": agent_type.value,
            "period_days": days,
            "total_evaluations": len(recent_metrics),
            "metrics": {}
        }
        
        for metric_type, values in metrics_by_type.items():
            summary["metrics"][metric_type.value] = {
                "average": statistics.mean(values),
                "median": statistics.median(values),
                "min": min(values),
                "max": max(values),
                "count": len(values),
                "trend": self._calculate_trend(values)
            }
        
        return summary
    
    def _calculate_trend(self, values: List[float]) -> str:
        """Calculate trend direction for metric values"""
        if len(values) < 2:
            return "insufficient_data"
        
        # Simple trend calculation using first and last quartile
        q1_end = len(values) // 4
        q4_start = 3 * len(values) // 4
        
        if q1_end >= q4_start:
            return "insufficient_data"
        
        early_avg = statistics.mean(values[:q1_end]) if q1_end > 0 else values[0]
        recent_avg = statistics.mean(values[q4_start:])
        
        diff_percent = (recent_avg - early_avg) / early_avg if early_avg != 0 else 0
        
        if diff_percent > 0.05:
            return "improving"
        elif diff_percent < -0.05:
            return "declining"
        else:
            return "stable"
    
    def generate_comprehensive_report(self, days: int = 7) -> Dict[str, Any]:
        """Generate comprehensive report across all agents"""
        report = {
            "report_date": datetime.utcnow().isoformat(),
            "period_days": days,
            "system_status": {
                "judge_enabled": self.enabled,
                "llm_enabled": self.use_llm,
                "langfuse_connected": prompt_manager.langfuse is not None
            },
            "agent_summaries": {},
            "overall_metrics": {},
            "recommendations": []
        }
        
        # Get summaries for each agent type
        for agent_type in AgentType:
            summary = self.get_agent_performance_summary(agent_type, days)
            report["agent_summaries"][agent_type.value] = summary
        
        # Calculate overall system metrics
        all_recent_evaluations = []
        for evaluation in self.session_evaluations.values():
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            if evaluation.timestamp >= cutoff_date:
                all_recent_evaluations.append(evaluation)
        
        if all_recent_evaluations:
            overall_scores = [e.overall_score for e in all_recent_evaluations if e.overall_score > 0]
            if overall_scores:
                report["overall_metrics"] = {
                    "average_score": statistics.mean(overall_scores),
                    "median_score": statistics.median(overall_scores),
                    "total_evaluations": len(all_recent_evaluations),
                    "score_distribution": self._get_score_distribution(overall_scores)
                }
        
        # Generate system-wide recommendations
        report["recommendations"] = self._generate_system_recommendations(report)
        
        return report
    
    def _get_score_distribution(self, scores: List[float]) -> Dict[str, int]:
        """Calculate score distribution"""
        distribution = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
        
        for score in scores:
            if score >= 0.9:
                distribution["excellent"] += 1
            elif score >= 0.7:
                distribution["good"] += 1
            elif score >= 0.5:
                distribution["fair"] += 1
            else:
                distribution["poor"] += 1
        
        return distribution
    
    def _generate_system_recommendations(self, report: Dict[str, Any]) -> List[str]:
        """Generate system-wide recommendations based on performance data"""
        recommendations = []
        
        if not report["system_status"]["langfuse_connected"]:
            recommendations.append("Configure Langfuse connection for better observability")
        
        if not report["system_status"]["llm_enabled"]:
            recommendations.append("Enable LLM judges for more accurate evaluations")
        
        # Analyze agent performance
        for agent_name, summary in report["agent_summaries"].items():
            if isinstance(summary, dict) and "metrics" in summary:
                for metric_name, metric_data in summary["metrics"].items():
                    if metric_data.get("trend") == "declining":
                        recommendations.append(f"Investigate declining {metric_name} for {agent_name}")
                    if metric_data.get("average", 0) < 0.6:
                        recommendations.append(f"Improve {metric_name} performance for {agent_name}")
        
        # Overall system health
        if "overall_metrics" in report:
            avg_score = report["overall_metrics"].get("average_score", 0)
            if avg_score < 0.7:
                recommendations.append("Overall system performance below target - review agent configurations")
        
        return recommendations

# Global enhanced judge system instance
enhanced_judge_system = EnhancedJudgeSystem()

# Convenience functions for easy integration
def start_agent_evaluation(session_id: str, agent_type: AgentType, 
                         input_data: Dict[str, Any], trace_id: Optional[str] = None) -> str:
    """Start comprehensive evaluation for an agent session"""
    return enhanced_judge_system.create_session_evaluation(session_id, agent_type, input_data, trace_id)

def record_performance_metric(session_id: str, metric_type: MetricType, 
                            value: float, context: Dict[str, Any] = None):
    """Record a performance metric for an evaluation session"""
    enhanced_judge_system.add_performance_metric(session_id, metric_type, value, context)

def judge_agent_output(session_id: str, output_data: Dict[str, Any]) -> JudgeResult:
    """Judge agent output and return evaluation result"""
    return enhanced_judge_system.judge_agent_output(session_id, output_data)

def finalize_agent_evaluation(session_id: str) -> ComprehensiveEvaluation:
    """Finalize evaluation and get comprehensive results"""
    return enhanced_judge_system.finalize_evaluation(session_id)

def get_performance_report(agent_type: Optional[AgentType] = None, days: int = 7) -> Dict[str, Any]:
    """Get performance report for specific agent or entire system"""
    if agent_type:
        return enhanced_judge_system.get_agent_performance_summary(agent_type, days)
    else:
        return enhanced_judge_system.generate_comprehensive_report(days)

if __name__ == "__main__":
    print("🧪 Testing Enhanced Judge System...")
    
    # Test session evaluation
    session_id = "test_session_123"
    start_agent_evaluation(session_id, AgentType.ITEM_MATCHER, {
        "description": "1/2 inch PVC pipe",
        "vendor": "ACME Corp"
    })
    
    # Record metrics
    record_performance_metric(session_id, MetricType.RESPONSE_TIME, 1.5)
    record_performance_metric(session_id, MetricType.CONFIDENCE, 0.85)
    
    # Judge output
    result = judge_agent_output(session_id, {
        "canonical_item_id": "PVC_PIPE_05",
        "match_confidence": 0.85,
        "match_type": "fuzzy"
    })
    
    print(f"Judge result: {result.score:.2f} - {result.reasoning}")
    
    # Finalize evaluation
    final_eval = finalize_agent_evaluation(session_id)
    print(f"Final evaluation score: {final_eval.overall_score:.2f}")
    
    # Get performance report
    report = get_performance_report(days=1)
    print(f"System report generated with {len(report.get('recommendations', []))} recommendations")
    
    print("✅ Enhanced Judge System test complete!")