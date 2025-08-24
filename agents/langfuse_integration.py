"""
Langfuse Integration for Agent Prompt Management
Provides centralized prompt management and LLM call tracing for all agents
"""

import os
import json
from typing import Dict, Any, Optional, List
from datetime import datetime

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from langfuse import Langfuse
    LANGFUSE_AVAILABLE = True
except ImportError:
    LANGFUSE_AVAILABLE = False
    Langfuse = None

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    openai = None

# Import OpenRouter client
try:
    from ..llm.openrouter_client import openrouter_client, call_openrouter, ModelTier
    OPENROUTER_AVAILABLE = True
except ImportError:
    try:
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
        from llm.openrouter_client import openrouter_client, call_openrouter, ModelTier
        OPENROUTER_AVAILABLE = True
    except ImportError:
        OPENROUTER_AVAILABLE = False
        openrouter_client = None
        call_openrouter = None
        ModelTier = None

class LangfusePromptManager:
    """Manages prompts and LLM calls through Langfuse"""
    
    def __init__(self):
        self.langfuse = None
        self.openai_client = None
        self._initialize_clients()
    
    def _initialize_clients(self):
        """Initialize Langfuse, OpenAI, and OpenRouter clients"""
        # Initialize Langfuse
        if LANGFUSE_AVAILABLE:
            public_key = os.getenv('LANGFUSE_PUBLIC_KEY')
            secret_key = os.getenv('LANGFUSE_SECRET_KEY')
            host = os.getenv('LANGFUSE_HOST', 'https://cloud.langfuse.com')
            
            if public_key and secret_key:
                try:
                    self.langfuse = Langfuse(
                        public_key=public_key,
                        secret_key=secret_key,
                        host=host
                    )
                    print("✅ Langfuse initialized for prompt management")
                except Exception as e:
                    print(f"❌ Failed to initialize Langfuse: {e}")
                    self.langfuse = None
            else:
                print("⚠️ Langfuse credentials not configured")
                self.langfuse = None
        else:
            print("⚠️ Langfuse not available")
            
        # Initialize OpenRouter (preferred) or OpenAI
        self.openai_client = None
        
        if OPENROUTER_AVAILABLE and openrouter_client and openrouter_client.client:
            print("✅ OpenRouter client available for LLM calls")
            # OpenRouter client is already initialized
        elif OPENAI_AVAILABLE:
            api_key = os.getenv('OPENAI_API_KEY')
            if api_key and not api_key.startswith('sk-proj-placeholder'):
                try:
                    self.openai_client = openai.OpenAI(api_key=api_key)
                    print("✅ OpenAI initialized for LLM calls")
                except Exception as e:
                    print(f"❌ Failed to initialize OpenAI: {e}")
                    self.openai_client = None
            else:
                print("⚠️ OpenAI API key not configured")
        else:
            print("⚠️ Neither OpenRouter nor OpenAI available")
    
    def get_prompt(self, prompt_name: str, variables: Optional[Dict[str, Any]] = None) -> str:
        """Get prompt from Langfuse or fallback to local prompts"""
        if self.langfuse:
            try:
                # Try to get prompt with default label
                prompt = self.langfuse.get_prompt(prompt_name, label="latest")
                if variables:
                    return prompt.compile(**variables)
                return prompt.prompt
            except Exception as e:
                try:
                    # Fallback to get prompt without label
                    prompt = self.langfuse.get_prompt(prompt_name)
                    if variables:
                        return prompt.compile(**variables)
                    return prompt.prompt
                except Exception as e2:
                    print(f"⚠️ Failed to get prompt '{prompt_name}' from Langfuse: {e2}")
        
        # Fallback to hardcoded prompts
        return self._get_fallback_prompt(prompt_name, variables)
    
    def _get_fallback_prompt(self, prompt_name: str, variables: Optional[Dict[str, Any]] = None) -> str:
        """Fallback prompts when Langfuse is unavailable"""
        prompts = {
            "item_matcher_backstory": """You are an expert at matching product descriptions to standardized catalog items. 
You use exact matching, synonyms, and fuzzy matching to find the best matches. 
When confidence is medium (0.75-0.85), you propose new synonyms for human review.""",
            
            "price_learner_backstory": """You are a pricing analyst that validates unit prices against expected ranges. 
When prices fall outside normal ranges, you propose range adjustments based on 
market data and pricing patterns.""",
            
            "rule_applier_backstory": """You are a compliance officer that applies business rules to invoice line items. 
You make decisions based on match confidence, price validity, quantity limits, 
and other business policies. You provide clear reasons for each decision.""",
            
            "item_validator_backstory": """You are a vigilant guardian of data quality in a facility management system. 
Your mission is to catch inappropriate submissions, spam, and non-facility items 
while allowing legitimate materials and equipment through. Users will try to 
test your limits by submitting random items, personal belongings, inappropriate 
content, or completely unrelated things. Stay sharp and protect the system!""",
            
            "item_validator_system": """You are an expert item validator for a facilities management system. Your job is to determine if user-submitted items are legitimate materials or equipment that would be used in building maintenance, construction, or facility operations.

ITEM TO VALIDATE:
Name: {item_name}
Description: {item_description}
Context: {context}

VALIDATION CRITERIA:
✅ APPROVE if the item is:
- Construction materials (lumber, concrete, steel, etc.)
- Plumbing supplies (pipes, fittings, valves, etc.)
- Electrical components (wires, outlets, switches, etc.)
- HVAC equipment and parts
- Hand tools or power tools
- Safety equipment (helmets, gloves, etc.)
- Cleaning supplies for facility maintenance
- Hardware (screws, bolts, fasteners, etc.)

❌ REJECT if the item is:
- Personal items unrelated to facility management
- Food, beverages, or consumables
- Office supplies (unless facility-related)
- Inappropriate or offensive content
- Completely unrelated to building/maintenance
- Spam or nonsensical text
- Items containing profanity

⚠️ FLAG FOR REVIEW if:
- The classification is unclear
- It could be facility-related but needs expert judgment
- The description is too vague to determine

Respond with a JSON object containing:
{{
  "decision": "approved|rejected|needs_review",
  "confidence": 0.0-1.0,
  "reason": "reason_code",
  "details": "explanation of the decision"
}}""",
            
            "price_judge_system": """You are a pricing expert judge for facilities management items. 
Analyze the given price and item context to determine if the price is reasonable, too high, too low, or requires investigation.

Consider:
- Market rates for similar items
- Quality indicators in the description
- Quantity and bulk pricing
- Regional pricing variations
- Seasonal factors

Respond with structured analysis and confidence score.""",
            
            "match_judge_system": """You are an item matching expert judge. 
Evaluate whether the proposed match between an invoice line item and a canonical catalog item is correct.

MATCH TO EVALUATE:
Invoice Description: {invoice_description}
Canonical Item: {canonical_item}
Algorithm Confidence: {confidence}
Match Type: {match_type}

EVALUATION CRITERIA:
✅ EXCELLENT MATCH (0.9-1.0):
- Exact semantic meaning
- Specifications align perfectly
- No ambiguity in classification

✅ GOOD MATCH (0.7-0.8):
- Clear semantic similarity
- Minor specification differences acceptable
- Functionally equivalent items

⚠️ QUESTIONABLE MATCH (0.4-0.6):
- Some semantic similarity but unclear
- Significant specification differences
- May need human review

❌ POOR MATCH (0.0-0.3):
- Different item categories
- No clear relationship
- Algorithm error evident

Consider:
- Semantic similarity and synonyms
- Technical specifications compatibility
- Brand vs generic equivalents
- Context clues in descriptions
- Industry terminology standards

Respond with JSON:
{{
  "score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "detailed assessment of match quality",
  "issues": ["any problems identified"],
  "strengths": ["positive aspects of the match"]
}}""",
            
            "price_judge_system": """You are a pricing expert judge for facilities management items. 
Analyze the given price and item context to determine if the price is reasonable.

PRICE TO EVALUATE:
Item: {item_name}
Unit Price: ${unit_price}
Expected Range: {expected_range}
Market Context: {market_context}

EVALUATION CRITERIA:
✅ REASONABLE PRICE (0.8-1.0):
- Within or close to expected range
- Aligns with market rates
- Quality justifies price

⚠️ QUESTIONABLE PRICE (0.4-0.7):
- Outside expected range but explainable
- Market conditions may justify
- Quality/brand premium possible

❌ UNREASONABLE PRICE (0.0-0.3):
- Significantly out of range
- No clear market justification
- Potential pricing error

Consider:
- Market rates for similar items
- Quality indicators in description
- Quantity and bulk pricing effects
- Regional pricing variations
- Seasonal factors
- Brand premiums
- Supply chain disruptions

Respond with JSON:
{{
  "score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "detailed price assessment",
  "market_factors": ["relevant market considerations"],
  "recommendations": ["pricing recommendations"]
}}""",

            "validator_v2": """You are an advanced facility management (FM) item validator. Your job is to classify user-submitted items as legitimate FM materials/equipment or inappropriate submissions.

ITEM TO VALIDATE:
Name: {item_name}
Description: {item_description}
Service Line: {service_line}
Service Type: {service_type}
Context: {context}

APPROVED items include:
- Construction materials (pipes, fittings, lumber, concrete, rebar, insulation)
- Plumbing supplies (valves, gaskets, seals, pumps, fixtures)
- Electrical components (wire, conduit, switches, outlets, panels, breakers)
- HVAC equipment (filters, ducts, thermostats, compressors, coils)
- Tools and hardware (screws, bolts, wrenches, drills, safety equipment)
- Maintenance supplies (lubricants, cleaning supplies, replacement parts)
- Safety equipment (hard hats, safety glasses, protective gear)

REJECTED items include:
- Personal items (food, beverages, clothing, personal electronics)
- Labor/services (technician fees, hourly work, consultation services)
- Administrative costs (taxes, processing fees, convenience charges)
- Inappropriate content (profanity, nonsensical text, spam)
- Non-FM materials (office furniture, decorative items, consumables)

NEEDS_REVIEW items include:
- Ambiguous descriptions that could be either category
- Items that might be FM-related but unclear from description
- Border-line cases requiring expert human judgment

VALIDATION LOGIC:
1. Check for clear FM material indicators (technical specs, industry terms)
2. Verify alignment with service line/type context
3. Identify any red flags or inappropriate content
4. Assess overall legitimacy and business appropriateness

Respond with JSON:
{{
  "verdict": "APPROVED|REJECTED|NEEDS_REVIEW",
  "score": 0.0-1.0,
  "reasons": ["specific reasons for decision"],
  "category": "plumbing|electrical|hvac|construction|tools|safety|maintenance|general",
  "confidence": 0.0-1.0
}}

Be conservative - when in doubt, use NEEDS_REVIEW rather than APPROVED."""
        }
        
        template = prompts.get(prompt_name, f"Prompt '{prompt_name}' not found")
        
        if variables and isinstance(template, str):
            try:
                return template.format(**variables)
            except KeyError as e:
                print(f"⚠️ Missing variable {e} for prompt '{prompt_name}'")
                return template
        
        return template
    
    def call_llm(self, prompt: str, model: str = "gpt-4o-mini", temperature: float = 0.1, 
                 max_tokens: int = 1000, trace_name: str = "llm_call", 
                 metadata: Optional[Dict[str, Any]] = None, task_type: str = "general") -> Optional[str]:
        """Make LLM call with Langfuse tracing using OpenRouter or OpenAI"""
        
        # Prefer OpenRouter if available
        if OPENROUTER_AVAILABLE and openrouter_client and openrouter_client.client:
            return self._call_llm_openrouter(prompt, model, temperature, max_tokens, 
                                           trace_name, metadata, task_type)
        elif self.openai_client:
            return self._call_llm_openai(prompt, model, temperature, max_tokens, 
                                       trace_name, metadata)
        else:
            print("⚠️ No LLM client available, returning None")
            return None
    
    def _call_llm_openrouter(self, prompt: str, model: str, temperature: float, 
                           max_tokens: int, trace_name: str, metadata: Optional[Dict[str, Any]], 
                           task_type: str) -> Optional[str]:
        """Make LLM call using OpenRouter"""
        
        # Use task-specific model if model not explicitly set
        if model == "gpt-4o-mini":  # Default model, use task-specific selection
            model = openrouter_client.get_model_for_task(task_type)
        
        # Create Langfuse generation using correct API
        generation = None
        if self.langfuse:
            try:
                generation = self.langfuse.start_generation(
                    name=trace_name,
                    model=model,
                    input=[{"role": "user", "content": prompt}],
                    model_parameters={
                        "temperature": temperature,
                        "max_tokens": max_tokens
                    },
                    metadata={
                        **(metadata or {}),
                        "provider": "openrouter",
                        "task_type": task_type
                    }
                )
            except Exception as e:
                print(f"⚠️ Failed to create Langfuse generation: {e}")
        
        try:
            # Make OpenRouter call
            response = openrouter_client.call_llm(
                prompt=prompt,
                model=model,
                task_type=task_type,
                temperature=temperature,
                max_tokens=max_tokens,
                metadata=metadata
            )
            
            # Update Langfuse generation with response
            if generation and response:
                try:
                    generation.update(
                        output=response,
                        # Note: OpenRouter doesn't always return usage stats
                        usage={"provider": "openrouter", "model": model}
                    )
                    generation.end()
                except Exception as e:
                    print(f"⚠️ Failed to update Langfuse generation: {e}")
            
            return response
            
        except Exception as e:
            print(f"❌ OpenRouter LLM call failed: {e}")
            if generation:
                try:
                    generation.update(
                        output={"error": str(e)},
                        level="ERROR"
                    )
                    generation.end()
                except:
                    pass
            return None
    
    def _call_llm_openai(self, prompt: str, model: str, temperature: float, 
                        max_tokens: int, trace_name: str, metadata: Optional[Dict[str, Any]]) -> Optional[str]:
        """Make LLM call using OpenAI (fallback)"""
        
        # Create Langfuse generation using correct API
        generation = None
        if self.langfuse:
            try:
                generation = self.langfuse.start_generation(
                    name=trace_name,
                    model=model,
                    input=[{"role": "user", "content": prompt}],
                    model_parameters={
                        "temperature": temperature,
                        "max_tokens": max_tokens
                    },
                    metadata=metadata or {}
                )
            except Exception as e:
                print(f"⚠️ Failed to create Langfuse generation: {e}")
        
        try:
            
            # Make OpenAI call
            response = self.openai_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature,
                max_tokens=max_tokens
            )
            
            # Extract response content
            content = response.choices[0].message.content
            
            # Update Langfuse generation with response
            if generation:
                try:
                    # Update generation first, then end it
                    generation.update(
                        output=content,
                        usage={
                            "input": response.usage.prompt_tokens,
                            "output": response.usage.completion_tokens,
                            "total": response.usage.total_tokens
                        }
                    )
                    generation.end()
                except Exception as e:
                    print(f"⚠️ Failed to update Langfuse generation: {e}")
            
            return content
            
        except Exception as e:
            print(f"❌ LLM call failed: {e}")
            if generation:
                try:
                    generation.update(
                        output={"error": str(e)},
                        level="ERROR"
                    )
                    generation.end()
                except:
                    pass
            return None
    
    def create_judge_evaluation(self, name: str, input_data: Dict[str, Any], 
                               output_data: Dict[str, Any], score: float, 
                               comment: str = "", trace_id: str = None) -> bool:
        """Create a judge evaluation in Langfuse"""
        if not self.langfuse:
            return False
            
        try:
            # Create a score/evaluation using correct API
            evaluation = self.langfuse.create_score(
                name=name,
                value=score,
                comment=comment,
                trace_id=trace_id,  # Link to trace if available
                metadata={
                    "input": input_data,
                    "output": output_data,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
            return True
        except Exception as e:
            print(f"❌ Failed to create judge evaluation: {e}")
            return False
    
    def setup_default_prompts(self):
        """Set up default prompts in Langfuse"""
        if not self.langfuse:
            print("⚠️ Cannot setup prompts - Langfuse not available")
            return False
        
        default_prompts = [
            {
                "name": "item_matcher_backstory",
                "prompt": self._get_fallback_prompt("item_matcher_backstory"),
                "labels": ["agent_backstory", "item_matching", "invoice_processing"]
            },
            {
                "name": "price_learner_backstory", 
                "prompt": self._get_fallback_prompt("price_learner_backstory"),
                "labels": ["agent_backstory", "pricing", "invoice_processing"]
            },
            {
                "name": "rule_applier_backstory",
                "prompt": self._get_fallback_prompt("rule_applier_backstory"),
                "labels": ["agent_backstory", "business_rules", "invoice_processing"]
            },
            {
                "name": "item_validator_backstory",
                "prompt": self._get_fallback_prompt("item_validator_backstory"),
                "labels": ["agent_backstory", "validation", "content_filtering"]
            },
            {
                "name": "item_validator_system",
                "prompt": self._get_fallback_prompt("item_validator_system"),
                "labels": ["system_prompt", "validation", "content_filtering", "user_input"]
            },
            {
                "name": "validator_v2",
                "prompt": self._get_fallback_prompt("validator_v2"),
                "labels": ["system_prompt", "validation", "pre_validation", "v2", "advanced"]
            },
            {
                "name": "price_judge_system",
                "prompt": self._get_fallback_prompt("price_judge_system"),
                "labels": ["system_prompt", "judge", "pricing", "evaluation"]
            },
            {
                "name": "match_judge_system",
                "prompt": self._get_fallback_prompt("match_judge_system"),
                "labels": ["system_prompt", "judge", "matching", "evaluation"]
            }
        ]
        
        created_count = 0
        for prompt_config in default_prompts:
            try:
                self.langfuse.create_prompt(
                    name=prompt_config["name"],
                    prompt=prompt_config["prompt"],
                    labels=prompt_config["labels"]
                )
                created_count += 1
                print(f"✅ Created prompt: {prompt_config['name']}")
            except Exception as e:
                print(f"❌ Failed to create prompt {prompt_config['name']}: {e}")
        
        print(f"📝 Created {created_count}/{len(default_prompts)} prompts in Langfuse")
        return created_count > 0

# Global instance
prompt_manager = LangfusePromptManager()

# Convenience functions
def get_prompt(prompt_name: str, **variables) -> str:
    """Get prompt with variables"""
    return prompt_manager.get_prompt(prompt_name, variables)

def call_llm(prompt: str, **kwargs) -> Optional[str]:
    """Make LLM call with tracing"""
    return prompt_manager.call_llm(prompt, **kwargs)

def create_judge_evaluation(name: str, input_data: Dict[str, Any], 
                           output_data: Dict[str, Any], score: float, 
                           comment: str = "") -> bool:
    """Create judge evaluation"""
    return prompt_manager.create_judge_evaluation(name, input_data, output_data, score, comment)

def setup_langfuse_prompts():
    """Setup default prompts - call this once to initialize Langfuse"""
    return prompt_manager.setup_default_prompts()

def handle_classify_request():
    """Handle classification request from TypeScript via stdin"""
    import sys
    
    try:
        # Read input from stdin
        input_data = sys.stdin.read().strip()
        if not input_data:
            return {"error": "No input data provided"}
            
        request = json.loads(input_data)
        
        # Extract request parameters
        action = request.get("action")
        if action != "classify_with_prompt":
            return {"error": f"Unknown action: {action}"}
            
        prompt_name = request.get("prompt_name", "validator_v2")
        variables = request.get("variables", {})
        task_type = request.get("task_type", "validation")
        trace_name = request.get("trace_name", "llm_classify")
        metadata = request.get("metadata", {})
        
        # Get the prompt with variables
        prompt_text = get_prompt(prompt_name, **variables)
        
        # Make LLM call with tracing
        response = call_llm(
            prompt=prompt_text,
            task_type=task_type,
            trace_name=trace_name,
            metadata=metadata
        )
        
        return {"response": response}
        
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    # Check if this is being called from the API
    import sys
    if len(sys.argv) == 1 and not sys.stdin.isatty():
        # Being called via API - handle classification request
        result = handle_classify_request()
        print(json.dumps(result))
    else:
        # Test mode - run integration tests
        print("🧪 Testing Langfuse integration...")
        
        # Test prompt retrieval
        backstory = get_prompt("item_validator_system", 
                              item_name="PVC Pipe", 
                              item_description="1/2 inch PVC pipe", 
                              context="Testing")
        print("Prompt retrieved:", len(backstory), "characters")
        
        # Test LLM call if available
        if prompt_manager.openai_client or (OPENROUTER_AVAILABLE and openrouter_client):
            response = call_llm("Say 'Hello from LLM integration test' and nothing else.", 
                               trace_name="integration_test")
            print("LLM response:", response)
        
        # Setup prompts if Langfuse available
        if prompt_manager.langfuse:
            setup_langfuse_prompts()
        
        print("✅ Integration test complete")