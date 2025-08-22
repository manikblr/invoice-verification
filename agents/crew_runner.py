import os
import json
import uuid
import time
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from .agents import AgentCreator
from .tools.matching_tool import MatchResult
from .tools.pricing_tool import PriceValidationResult
from .tools.rules_tool import RuleResult, Decision
from obs.langfuse_client import with_span
from .judges import JudgeRunner
from .enhanced_judge_system import (
    enhanced_judge_system, start_agent_evaluation, record_performance_metric,
    judge_agent_output, finalize_agent_evaluation, AgentType, MetricType
)


@dataclass
class LineItemDecision:
    canonical_item_id: Optional[str]
    canonical_name: Optional[str]
    match_confidence: float
    decision: str
    reasons: List[str]
    policy_codes: List[str]
    proposals: List[str]  # List of proposal IDs
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'canonical_item_id': self.canonical_item_id,
            'canonical_name': self.canonical_name,
            'match_confidence': self.match_confidence,
            'decision': self.decision,
            'reasons': self.reasons,
            'policy_codes': self.policy_codes,
            'proposals': self.proposals
        }


@dataclass
class LineItem:
    id: str
    description: str
    quantity: int
    unit_price: float


class CrewRunner:
    def __init__(self):
        self.agent_creator = AgentCreator()
        self.enabled = os.getenv('AGENT_ENABLED', 'true').lower() == 'true'
        self.dry_run = os.getenv('AGENT_DRY_RUN', 'true').lower() == 'true'
        self.judge_runner = JudgeRunner()
        
    def run_crew(self, invoice_id: str, vendor_id: str, items: List[Dict[str, Any]], trace: Optional[Any] = None) -> Dict[str, Any]:
        """
        Run the CrewAI pipeline for invoice verification with comprehensive evaluation
        
        Args:
            invoice_id: UUID of the invoice
            vendor_id: Vendor identifier
            items: List of line items with id, description, quantity, unit_price
            
        Returns:
            {invoice_id, decisions: {line_item_id: LineItemDecision}}
        """
        
        if not self.enabled:
            return self._create_disabled_response(invoice_id, items)
        
        # Start comprehensive evaluation
        crew_session_id = f"crew_{invoice_id}_{int(time.time())}"
        start_agent_evaluation(
            crew_session_id, 
            AgentType.CREW_ORCHESTRATOR,
            {
                "invoice_id": invoice_id,
                "vendor_id": vendor_id,
                "item_count": len(items),
                "items": items
            },
            trace_id=getattr(trace, 'id', None) if trace else None
        )
        
        start_time = time.time()
        
        with with_span(trace, "crew_initialization", 
                      input_data={'invoice_id': invoice_id, 'item_count': len(items)}) as span:
            
            # Parse line items
            line_items = [
                LineItem(
                    id=item['id'],
                    description=item['description'],
                    quantity=int(item['quantity']),
                    unit_price=float(item['unit_price'])
                )
                for item in items
            ]
            
            # Get tools
            tools = self.agent_creator.get_tools_direct()
            supabase = tools['supabase']
            
            span['output'] = {
                'parsed_items': len(line_items),
                'tools_loaded': len(tools)
            }
        
        # Log pipeline start
        supabase.log_event(invoice_id, None, 'CREW_START', {
            'item_count': len(line_items),
            'vendor_id_hash': vendor_id,  # Will be hashed by supabase_tool
            'dry_run': self.dry_run
        })
        
        # Process each line item through the pipeline
        decisions = {}
        all_proposals = []
        
        with with_span(trace, "process_all_items", 
                      input_data={'item_count': len(line_items)}) as span:
            
            for line_item in line_items:
                decision, proposals = self._process_line_item(
                    line_item, vendor_id, invoice_id, tools, trace
                )
                decisions[line_item.id] = decision.to_dict()
                all_proposals.extend(proposals)
            
            span['output'] = {
                'decisions_count': len(decisions),
                'total_proposals': len(all_proposals)
            }
        
        # Judge decisions after processing
        with with_span(trace, "judge", 
                      input_data={'decisions_count': len(decisions)}) as span:
            
            judge_results = {}
            for line_item in line_items:
                line_decision = decisions[line_item.id]
                
                # Get price band for judging
                price_band = None
                try:
                    if line_decision['canonical_item_id']:
                        pricing_tool = tools['pricing']
                        price_ranges = pricing_tool._get_price_ranges()
                        price_band = price_ranges.get(line_decision['canonical_item_id'])
                        if price_band:
                            price_band = {
                                'min_price': price_band.min_price,
                                'max_price': price_band.max_price
                            }
                except Exception:
                    pass  # Continue without price band
                
                # Judge the decision
                judgement = self.judge_runner.judge_line_item(
                    decision_data=line_decision,
                    description=line_item.description,
                    vendor_id=vendor_id,
                    unit_price=line_item.unit_price,
                    price_band=price_band,
                    invoice_id=invoice_id,
                    line_item_id=line_item.id
                )
                
                if judgement:
                    judge_results[line_item.id] = judgement
                    # Add judgement to decision
                    decisions[line_item.id]['judgement'] = judgement
            
            span['output'] = {
                'judged_items': len(judge_results),
                'judge_enabled': self.judge_runner.enabled
            }
        
        # Finalize with summary stats and comprehensive evaluation
        with with_span(trace, "finalize", 
                      input_data={'decisions_count': len(decisions)}) as span:
            
            summary_stats = self._calculate_summary_stats(decisions)
            
            # Record performance metrics
            total_time = time.time() - start_time
            record_performance_metric(crew_session_id, MetricType.RESPONSE_TIME, total_time)
            record_performance_metric(crew_session_id, MetricType.THROUGHPUT, len(items) / total_time if total_time > 0 else 0)
            record_performance_metric(crew_session_id, MetricType.ACCURACY, summary_stats.get('approval_rate', 0))
            
            # Judge crew orchestrator output
            crew_output = {
                'decisions': decisions,
                'summary_stats': summary_stats,
                'performance': {
                    'total_time': total_time,
                    'items_processed': len(items),
                    'proposals_created': len(all_proposals)
                }
            }
            
            crew_judge_result = judge_agent_output(crew_session_id, crew_output)
            
            # Finalize evaluation
            final_evaluation = finalize_agent_evaluation(crew_session_id)
            
            # Log pipeline completion
            supabase.log_event(invoice_id, None, 'CREW_COMPLETE', {
                **summary_stats,
                'total_proposals': len(all_proposals),
                'evaluation_score': final_evaluation.overall_score if final_evaluation else 0,
                'processing_time': total_time
            })
            
            span['output'] = {
                'summary_stats': summary_stats,
                'total_proposals': len(all_proposals),
                'evaluation': {
                    'overall_score': final_evaluation.overall_score if final_evaluation else 0,
                    'confidence': final_evaluation.confidence if final_evaluation else 0,
                    'judge_score': crew_judge_result.score,
                    'recommendations': crew_judge_result.recommendations
                }
            }
        
        result = {
            'invoice_id': invoice_id,
            'decisions': decisions,
            'pipeline_stats': summary_stats,
            'dry_run': self.dry_run
        }
        
        # Add evaluation data if available
        if final_evaluation:
            result['evaluation'] = {
                'session_id': crew_session_id,
                'overall_score': final_evaluation.overall_score,
                'confidence': final_evaluation.confidence,
                'recommendations': final_evaluation.recommendations,
                'performance_metrics': [
                    {
                        'type': metric.metric_type.value,
                        'value': metric.value,
                        'timestamp': metric.timestamp.isoformat()
                    } for metric in final_evaluation.performance_metrics
                ]
            }
        
        return result
    
    def _process_line_item(self, line_item: LineItem, vendor_id: str, 
                          invoice_id: str, tools: Dict[str, Any], trace: Optional[Any] = None) -> tuple[LineItemDecision, List[str]]:
        """Process a single line item through the pipeline with individual agent evaluation"""
        
        matching_tool = tools['matching']
        pricing_tool = tools['pricing']
        rules_tool = tools['rules']
        
        proposals = []
        
        # Create evaluation sessions for each agent
        matcher_session_id = f"matcher_{line_item.id}_{int(time.time())}"
        pricer_session_id = f"pricer_{line_item.id}_{int(time.time())}"
        rules_session_id = f"rules_{line_item.id}_{int(time.time())}"
        
        # Stage 1: ItemMatcher with evaluation
        with with_span(trace, "ItemMatcher", 
                      input_data={'line_item_id': line_item.id, 'description': line_item.description}) as span:
            
            # Start evaluation
            start_agent_evaluation(
                matcher_session_id,
                AgentType.ITEM_MATCHER,
                {'description': line_item.description, 'line_item_id': line_item.id}
            )
            
            match_start_time = time.time()
            
            match_result: MatchResult = matching_tool.match_item(
                line_item.description, line_item.id
            )
            
            # Record performance metrics and judge output
            match_time = time.time() - match_start_time
            record_performance_metric(matcher_session_id, MetricType.RESPONSE_TIME, match_time)
            record_performance_metric(matcher_session_id, MetricType.CONFIDENCE, match_result.confidence)
            
            match_output = {
                'canonical_item_id': match_result.canonical_item_id,
                'canonical_name': match_result.canonical_name,
                'match_confidence': match_result.confidence,
                'match_type': match_result.match_type,
                'proposal_created': match_result.proposal_id is not None
            }
            
            judge_agent_output(matcher_session_id, match_output)
            finalize_agent_evaluation(matcher_session_id)
            
            if match_result.proposal_id:
                proposals.append(match_result.proposal_id)
            
            span['output'] = match_output
        
        # Stage 2: PriceLearner with evaluation
        with with_span(trace, "PriceLearner", 
                      input_data={
                          'canonical_item_id': match_result.canonical_item_id,
                          'unit_price': line_item.unit_price
                      }) as span:
            
            # Start evaluation
            start_agent_evaluation(
                pricer_session_id,
                AgentType.PRICE_LEARNER,
                {
                    'canonical_item_id': match_result.canonical_item_id,
                    'unit_price': line_item.unit_price,
                    'line_item_id': line_item.id
                }
            )
            
            price_start_time = time.time()
            
            price_result: PriceValidationResult = pricing_tool.validate_price(
                match_result.canonical_item_id, line_item.unit_price, line_item.id
            )
            
            # Record performance metrics and judge output
            price_time = time.time() - price_start_time
            record_performance_metric(pricer_session_id, MetricType.RESPONSE_TIME, price_time)
            record_performance_metric(pricer_session_id, MetricType.ACCURACY, 1.0 if price_result.is_valid else 0.0)
            
            price_output = {
                'is_valid': price_result.is_valid,
                'expected_range': price_result.expected_range,
                'variance_percent': price_result.variance_percent,
                'proposal_created': price_result.proposal_id is not None
            }
            
            judge_agent_output(pricer_session_id, price_output)
            finalize_agent_evaluation(pricer_session_id)
            
            if price_result.proposal_id:
                proposals.append(price_result.proposal_id)
            
            span['output'] = price_output
        
        # Stage 3: RuleApplier with evaluation
        with with_span(trace, "RuleApplier", 
                      input_data={
                          'canonical_item_id': match_result.canonical_item_id,
                          'unit_price': line_item.unit_price,
                          'quantity': line_item.quantity,
                          'match_confidence': match_result.confidence,
                          'price_is_valid': price_result.is_valid
                      }) as span:
            
            # Start evaluation
            start_agent_evaluation(
                rules_session_id,
                AgentType.RULE_APPLIER,
                {
                    'canonical_item_id': match_result.canonical_item_id,
                    'unit_price': line_item.unit_price,
                    'quantity': line_item.quantity,
                    'match_confidence': match_result.confidence,
                    'price_is_valid': price_result.is_valid,
                    'vendor_id': vendor_id
                }
            )
            
            rules_start_time = time.time()
            
            rule_result: RuleResult = rules_tool.apply_rules(
                match_result.canonical_item_id,
                line_item.unit_price,
                line_item.quantity,
                match_result.confidence,
                price_result.is_valid,
                line_item.id,
                vendor_id
            )
            
            # Record performance metrics and judge output
            rules_time = time.time() - rules_start_time
            record_performance_metric(rules_session_id, MetricType.RESPONSE_TIME, rules_time)
            record_performance_metric(rules_session_id, MetricType.CONFIDENCE, rule_result.confidence)
            
            rules_output = {
                'decision': rule_result.decision.value,
                'policy_codes': rule_result.policy_codes,
                'reasons_count': len(rule_result.reasons),
                'confidence': rule_result.confidence,
                'reasons': rule_result.reasons
            }
            
            judge_agent_output(rules_session_id, rules_output)
            finalize_agent_evaluation(rules_session_id)
            
            span['output'] = rules_output
        
        # Create final decision
        decision = LineItemDecision(
            canonical_item_id=match_result.canonical_item_id,
            canonical_name=match_result.canonical_name,
            match_confidence=match_result.confidence,
            decision=rule_result.decision.value,
            reasons=rule_result.reasons,
            policy_codes=rule_result.policy_codes,
            proposals=proposals
        )
        
        return decision, proposals
    
    def _create_disabled_response(self, invoice_id: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Create response when agent is disabled"""
        decisions = {}
        
        for item in items:
            decisions[item['id']] = {
                'canonical_item_id': None,
                'canonical_name': None,
                'match_confidence': 0.0,
                'decision': 'NEEDS_MORE_INFO',
                'reasons': ['Agent pipeline disabled'],
                'policy_codes': ['AGENT_DISABLED'],
                'proposals': []
            }
        
        return {
            'invoice_id': invoice_id,
            'decisions': decisions,
            'pipeline_stats': {'agent_enabled': False},
            'dry_run': True
        }
    
    def _calculate_summary_stats(self, decisions: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate summary statistics from decisions"""
        
        total_items = len(decisions)
        if total_items == 0:
            return {'total_items': 0}
        
        decisions_count = {
            'ALLOW': 0,
            'DENY': 0,
            'NEEDS_MORE_INFO': 0
        }
        
        match_confidences = []
        matched_items = 0
        
        for decision in decisions.values():
            decisions_count[decision['decision']] += 1
            
            if decision['canonical_item_id']:
                matched_items += 1
                match_confidences.append(decision['match_confidence'])
        
        avg_confidence = sum(match_confidences) / len(match_confidences) if match_confidences else 0.0
        
        return {
            'total_items': total_items,
            'matched_items': matched_items,
            'match_rate': matched_items / total_items,
            'avg_match_confidence': avg_confidence,
            'decisions': decisions_count,
            'approval_rate': decisions_count['ALLOW'] / total_items
        }
    
    def run_crew_with_crewai(self, invoice_id: str, vendor_id: str, 
                            items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Alternative implementation using CrewAI framework
        (Currently uses direct tool access for better control)
        """
        
        # For now, use direct processing for better error handling and performance
        # This can be switched to full CrewAI crew execution later
        return self.run_crew(invoice_id, vendor_id, items)
    
    def health_check(self) -> Dict[str, Any]:
        """Health check for the crew runner"""
        tools = self.agent_creator.get_tools_direct()
        
        return {
            'enabled': self.enabled,
            'dry_run': self.dry_run,
            'tools_loaded': len(tools) == 4,
            'matching_stats': tools['matching'].get_match_stats(),
            'pricing_stats': tools['pricing'].get_price_stats(),
            'rules_stats': tools['rules'].get_rule_stats()
        }