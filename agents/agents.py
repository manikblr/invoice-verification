from crewai import Agent, Task, Crew
from crewai_tools import BaseTool
from typing import Dict, Any, List, Optional
from .tools.supabase_tool import SupabaseTool
from .tools.matching_tool import MatchingTool
from .tools.pricing_tool import PricingTool
from .tools.rules_tool import RulesTool
from .validation_agent import ItemValidationTool
from .langfuse_integration import get_prompt
import os
from enum import Enum

# Agent execution states for pipeline management
class PipelineStage(Enum):
    PRE_VALIDATION = "pre_validation"
    CONTENT_VALIDATION = "content_validation"
    CANONICAL_MATCHING = "canonical_matching"
    WEB_SEARCH_INGESTION = "web_search_ingestion"
    PRICE_VALIDATION = "price_validation"
    BUSINESS_RULES = "business_rules"
    EXPLANATION_GENERATION = "explanation_generation"

class AgentStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class ItemMatcherTool(BaseTool):
    name: str = "item_matcher"
    description: str = "Matches invoice line items to canonical items using hybrid search"
    
    def __init__(self, matching_tool: MatchingTool):
        super().__init__()
        self.matching_tool = matching_tool
    
    def _run(self, description: str, line_item_id: str) -> str:
        result = self.matching_tool.match_item(description, line_item_id)
        return f"Match result: {result.match_type} confidence {result.confidence:.2f} -> {result.canonical_item_id or 'None'}"


class PriceLearnerTool(BaseTool):
    name: str = "price_learner"
    description: str = "Validates prices against expected ranges and creates adjustment proposals"
    
    def __init__(self, pricing_tool: PricingTool):
        super().__init__()
        self.pricing_tool = pricing_tool
    
    def _run(self, canonical_item_id: str, unit_price: float, line_item_id: str) -> str:
        result = self.pricing_tool.validate_price(canonical_item_id, unit_price, line_item_id)
        return f"Price validation: {'valid' if result.is_valid else 'invalid'} (variance: {result.variance_percent:.1%})"


class RuleApplierTool(BaseTool):
    name: str = "rule_applier"
    description: str = "Applies business rules to determine line item approval status"
    
    def __init__(self, rules_tool: RulesTool):
        super().__init__()
        self.rules_tool = rules_tool
    
    def _run(self, canonical_item_id: str, unit_price: float, quantity: int, 
             match_confidence: float, price_is_valid: bool, line_item_id: str, vendor_id: str) -> str:
        result = self.rules_tool.apply_rules(
            canonical_item_id, unit_price, quantity, match_confidence, 
            price_is_valid, line_item_id, vendor_id
        )
        return f"Rules decision: {result.decision.value} ({len(result.reasons)} reasons)"


class PreValidationTool(BaseTool):
    name: str = "pre_validator"
    description: str = "Performs initial validation checks including blacklist and structural validation"
    
    def _run(self, item_name: str, item_description: str = "", service_line: str = "") -> str:
        # Blacklisted terms that should immediately reject items
        blacklisted_terms = [
            'helper', 'labour', 'labor', 'technician', 'worker', 'employee',
            'fees', 'fee', 'charges', 'charge', 'visit', 'trip', 'mileage',
            'tax', 'gst', 'vat', 'misc', 'miscellaneous', 'food', 'beverage'
        ]
        
        item_lower = item_name.lower()
        
        # Check for blacklisted terms
        for term in blacklisted_terms:
            if term in item_lower:
                return f"REJECTED: Blacklisted term '{term}' detected in item name"
        
        # Basic structural validation
        if len(item_name.strip()) < 3:
            return "REJECTED: Item name too short"
        
        if item_name.strip() in ['--', '---', 'n/a', 'na', 'tbd']:
            return "REJECTED: Invalid or placeholder item name"
        
        return "APPROVED: Pre-validation passed"


class WebSearchIngestTool(BaseTool):
    name: str = "web_search_ingest"
    description: str = "Searches external vendor websites when canonical matches fail"
    
    def _run(self, item_name: str, match_confidence: float, line_item_id: str) -> str:
        # Only trigger web search if match confidence is low
        if match_confidence >= 0.7:
            return "SKIPPED: High confidence match found, web search not needed"
        
        # Check feature flag
        if os.getenv('FEATURE_WEB_INGEST') != 'true':
            return "SKIPPED: Web ingestion feature disabled"
        
        # Mock web search implementation
        # In production, this would search Grainger, Home Depot, Amazon Business
        vendors_searched = ['Grainger', 'Home Depot', 'Amazon Business']
        
        # Simulate search results
        search_results = {
            'vendors_searched': vendors_searched,
            'items_found': 2,
            'canonical_links_created': 1,
            'pricing_data_updated': True
        }
        
        return f"WEB_SEARCH_COMPLETED: Found {search_results['items_found']} items from {len(vendors_searched)} vendors"


class ExplanationAgentTool(BaseTool):
    name: str = "explanation_agent"
    description: str = "Generates detailed explanations for validation decisions and handles user explanation requests"
    
    def _run(self, decision: str, reasons: List[str], item_name: str, confidence: float) -> str:
        # Generate comprehensive explanation based on decision
        if decision == "ALLOW":
            explanation = f"✅ APPROVED: '{item_name}' meets all validation criteria with {confidence:.1%} confidence. "
            explanation += f"Validation passed because: {', '.join(reasons)}"
        elif decision == "REJECT":
            explanation = f"❌ REJECTED: '{item_name}' does not meet validation criteria. "
            explanation += f"Rejection reasons: {', '.join(reasons)}"
        else:  # NEEDS_REVIEW
            explanation = f"⚠️ NEEDS REVIEW: '{item_name}' requires human judgment. "
            explanation += f"Review needed because: {', '.join(reasons)}"
        
        return explanation


class AgentCreator:
    def __init__(self):
        self.supabase_tool = SupabaseTool()
        self.matching_tool = MatchingTool(self.supabase_tool)
        self.pricing_tool = PricingTool(self.supabase_tool)
        self.rules_tool = RulesTool(self.supabase_tool)
        
        # Create all 7 agent tool instances
        self.pre_validation_tool = PreValidationTool()
        self.item_validation_tool = ItemValidationTool()
        self.item_matcher_tool = ItemMatcherTool(self.matching_tool)
        self.web_search_ingest_tool = WebSearchIngestTool()
        self.price_learner_tool = PriceLearnerTool(self.pricing_tool)
        self.rule_applier_tool = RuleApplierTool(self.rules_tool)
        self.explanation_agent_tool = ExplanationAgentTool()
    
    def create_agents(self) -> List[Agent]:
        """Create all 7 agents for the complete validation pipeline"""
        
        # Agent 1: Pre-Validation Agent (first in pipeline)
        pre_validator = Agent(
            role='Pre-Validation Agent',
            goal='Perform initial validation checks before main processing pipeline',
            backstory=get_prompt("pre_validator_backstory") or (
                'You are the first line of defense in invoice validation. '
                'You conduct blacklist checks, structural validation, and basic content filtering '
                'to prevent invalid submissions from entering the main pipeline. You are thorough and decisive.'
            ),
            tools=[self.pre_validation_tool],
            verbose=False,
            allow_delegation=False
        )
        
        # Agent 2: Item Validation Agent (content validation)
        item_validator = Agent(
            role='Item Validator Agent',
            goal='Validate user submissions for inappropriate content and abuse detection',
            backstory=get_prompt("item_validator_backstory") or (
                'You are an LLM-powered content classifier that detects spam, profanity, and '
                'inappropriate submissions. You ensure items are legitimate facility management '
                'materials and classify them appropriately.'
            ),
            tools=[self.item_validation_tool],
            verbose=False,
            allow_delegation=False
        )
        
        # Agent 3: Item Matcher Agent (canonical matching)
        item_matcher = Agent(
            role='Item Matcher Agent',
            goal='Match invoice line items to canonical items with high accuracy',
            backstory=get_prompt("item_matcher_backstory") or (
                'You are an expert at matching product descriptions to standardized catalog items. '
                'You use exact matching, synonyms, and fuzzy matching to find the best matches. '
                'When confidence is medium (0.75-0.85), you propose new synonyms for human review.'
            ),
            tools=[self.item_matcher_tool],
            verbose=False,
            allow_delegation=False
        )
        
        # Agent 4: Web Search & Ingest Agent (external data acquisition)
        web_search_agent = Agent(
            role='Web Search & Ingest Agent',
            goal='Search external vendor websites and ingest new product data when matches fail',
            backstory=get_prompt("web_search_agent_backstory") or (
                'You are a data acquisition specialist that searches multiple vendor sites '
                '(Grainger, Home Depot, Amazon Business) when canonical matches fail. '
                'You use deterministic parsing and create canonical item links.'
            ),
            tools=[self.web_search_ingest_tool],
            verbose=False,
            allow_delegation=False
        )
        
        # Agent 5: Price Learner Agent (pricing validation)
        price_learner = Agent(
            role='Price Learner Agent',
            goal='Validate prices and learn from pricing patterns to improve ranges',
            backstory=get_prompt("price_learner_backstory") or (
                'You are a pricing analyst that validates unit prices against expected ranges. '
                'When prices fall outside normal ranges, you propose range adjustments based on '
                'market data and pricing patterns.'
            ),
            tools=[self.price_learner_tool],
            verbose=False,
            allow_delegation=False
        )
        
        # Agent 6: Rule Applier Agent (business rules and final decisions)
        rule_applier = Agent(
            role='Rule Applier Agent',
            goal='Apply business rules to determine approval status for line items',
            backstory=get_prompt("rule_applier_backstory") or (
                'You are a compliance officer that applies business rules to invoice line items. '
                'You make decisions based on match confidence, price validity, quantity limits, '
                'and other business policies. You provide clear reasons for each decision.'
            ),
            tools=[self.rule_applier_tool],
            verbose=False,
            allow_delegation=False
        )
        
        # Agent 7: Explanation Agent (decision explanations)
        explanation_agent = Agent(
            role='Explanation Agent',
            goal='Generate detailed explanations for validation decisions and handle user explanation requests',
            backstory=get_prompt("explanation_agent_backstory") or (
                'You are an expert communicator that provides comprehensive explanations for '
                'validation decisions. You verify explanation quality and handle user requests '
                'for additional information through an explanation loop system.'
            ),
            tools=[self.explanation_agent_tool],
            verbose=False,
            allow_delegation=False
        )
        
        return [
            pre_validator,
            item_validator, 
            item_matcher,
            web_search_agent,
            price_learner,
            rule_applier,
            explanation_agent
        ]
    
    def create_tasks(self, agents: List[Agent], invoice_data: Dict[str, Any]) -> List[Task]:
        """Create tasks for processing invoice line items"""
        
        item_matcher, price_learner, rule_applier = agents
        
        # Task 1: Match all line items
        matching_task = Task(
            description=(
                f"Match each line item in invoice {invoice_data['invoice_id']} to canonical items. "
                f"Process {len(invoice_data['items'])} items using hybrid search. "
                "Return match results with confidence scores."
            ),
            expected_output="Match results for all line items with confidence scores and canonical IDs",
            agent=item_matcher
        )
        
        # Task 2: Validate pricing
        pricing_task = Task(
            description=(
                f"Validate prices for matched items from invoice {invoice_data['invoice_id']}. "
                "Check against expected price ranges and flag anomalies. "
                "Create adjustment proposals when needed."
            ),
            expected_output="Price validation results and any adjustment proposals",
            agent=price_learner,
            dependencies=[matching_task]
        )
        
        # Task 3: Apply business rules
        rules_task = Task(
            description=(
                f"Apply business rules to determine approval status for invoice {invoice_data['invoice_id']} items. "
                "Consider match confidence, price validity, quantities, and business policies. "
                "Provide clear decisions with reasons and policy codes."
            ),
            expected_output="Final approval decisions with reasons and policy codes for each line item",
            agent=rule_applier,
            dependencies=[matching_task, pricing_task]
        )
        
        return [matching_task, pricing_task, rules_task]
    
    def create_crew(self, invoice_data: Dict[str, Any]) -> Crew:
        """Create a crew with agents and tasks for processing an invoice"""
        
        agents = self.create_agents()
        tasks = self.create_tasks(agents, invoice_data)
        
        crew = Crew(
            agents=agents,
            tasks=tasks,
            verbose=False,
            process='sequential'  # Run tasks in sequence
        )
        
        return crew
    
    def get_tools_direct(self):
        """Get direct access to tools for manual processing"""
        return {
            'matching': self.matching_tool,
            'pricing': self.pricing_tool,
            'rules': self.rules_tool,
            'supabase': self.supabase_tool
        }