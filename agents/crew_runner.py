import os
import json
import uuid
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from .agents import AgentCreator
from .tools.matching_tool import MatchResult
from .tools.pricing_tool import PriceValidationResult
from .tools.rules_tool import RuleResult, Decision
from obs.langfuse_client import with_span
from .judges import JudgeRunner


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
        Run the CrewAI pipeline for invoice verification
        
        Args:
            invoice_id: UUID of the invoice
            vendor_id: Vendor identifier
            items: List of line items with id, description, quantity, unit_price
            
        Returns:
            {invoice_id, decisions: {line_item_id: LineItemDecision}}
        """
        
        if not self.enabled:
            return self._create_disabled_response(invoice_id, items)
        
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
        
        # Finalize with summary stats
        with with_span(trace, "finalize", 
                      input_data={'decisions_count': len(decisions)}) as span:
            
            summary_stats = self._calculate_summary_stats(decisions)
            
            # Log pipeline completion
            supabase.log_event(invoice_id, None, 'CREW_COMPLETE', {
                **summary_stats,
                'total_proposals': len(all_proposals)
            })
            
            span['output'] = {
                'summary_stats': summary_stats,
                'total_proposals': len(all_proposals)
            }
        
        return {
            'invoice_id': invoice_id,
            'decisions': decisions,
            'pipeline_stats': summary_stats,
            'dry_run': self.dry_run
        }
    
    def _process_line_item(self, line_item: LineItem, vendor_id: str, 
                          invoice_id: str, tools: Dict[str, Any], trace: Optional[Any] = None) -> tuple[LineItemDecision, List[str]]:
        """Process a single line item through the pipeline"""
        
        matching_tool = tools['matching']
        pricing_tool = tools['pricing']
        rules_tool = tools['rules']
        
        proposals = []
        
        # Stage 1: ItemMatcher
        with with_span(trace, "ItemMatcher", 
                      input_data={'line_item_id': line_item.id, 'description': line_item.description}) as span:
            
            match_result: MatchResult = matching_tool.match_item(
                line_item.description, line_item.id
            )
            
            if match_result.proposal_id:
                proposals.append(match_result.proposal_id)
            
            span['output'] = {
                'canonical_item_id': match_result.canonical_item_id,
                'canonical_name': match_result.canonical_name,
                'match_confidence': match_result.confidence,
                'match_type': match_result.match_type,
                'proposal_created': match_result.proposal_id is not None
            }
        
        # Stage 2: PriceLearner
        with with_span(trace, "PriceLearner", 
                      input_data={
                          'canonical_item_id': match_result.canonical_item_id,
                          'unit_price': line_item.unit_price
                      }) as span:
            
            price_result: PriceValidationResult = pricing_tool.validate_price(
                match_result.canonical_item_id, line_item.unit_price, line_item.id
            )
            
            if price_result.proposal_id:
                proposals.append(price_result.proposal_id)
            
            span['output'] = {
                'is_valid': price_result.is_valid,
                'expected_range': price_result.expected_range,
                'variance_percent': price_result.variance_percent,
                'proposal_created': price_result.proposal_id is not None
            }
        
        # Stage 3: RuleApplier
        with with_span(trace, "RuleApplier", 
                      input_data={
                          'canonical_item_id': match_result.canonical_item_id,
                          'unit_price': line_item.unit_price,
                          'quantity': line_item.quantity,
                          'match_confidence': match_result.confidence,
                          'price_is_valid': price_result.is_valid
                      }) as span:
            
            rule_result: RuleResult = rules_tool.apply_rules(
                match_result.canonical_item_id,
                line_item.unit_price,
                line_item.quantity,
                match_result.confidence,
                price_result.is_valid,
                line_item.id,
                vendor_id
            )
            
            span['output'] = {
                'decision': rule_result.decision.value,
                'policy_codes': rule_result.policy_codes,
                'reasons_count': len(rule_result.reasons),
                'confidence': rule_result.confidence
            }
        
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