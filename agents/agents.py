from crewai import Agent, Task, Crew
from crewai_tools import BaseTool
from typing import Dict, Any, List
from .tools.supabase_tool import SupabaseTool
from .tools.matching_tool import MatchingTool
from .tools.pricing_tool import PricingTool
from .tools.rules_tool import RulesTool
from .langfuse_integration import get_prompt


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


class AgentCreator:
    def __init__(self):
        self.supabase_tool = SupabaseTool()
        self.matching_tool = MatchingTool(self.supabase_tool)
        self.pricing_tool = PricingTool(self.supabase_tool)
        self.rules_tool = RulesTool(self.supabase_tool)
        
        # Create tool instances
        self.item_matcher_tool = ItemMatcherTool(self.matching_tool)
        self.price_learner_tool = PriceLearnerTool(self.pricing_tool)
        self.rule_applier_tool = RuleApplierTool(self.rules_tool)
    
    def create_agents(self) -> List[Agent]:
        """Create the three main agents for the crew"""
        
        item_matcher = Agent(
            role='Item Matcher',
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
        
        price_learner = Agent(
            role='Price Learner',
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
        
        rule_applier = Agent(
            role='Rule Applier',
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
        
        return [item_matcher, price_learner, rule_applier]
    
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