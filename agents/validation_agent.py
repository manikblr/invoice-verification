"""
Item Validation Agent with Langfuse prompt management
Validates user-submitted items to detect inappropriate content and ensure proper material/equipment classification
"""

from crewai import Agent, Task, Crew
from crewai.tools import BaseTool
from typing import Dict, Any, List, Optional
from enum import Enum
import os
import json

# Import Langfuse integration and judge system
try:
    from .langfuse_integration import get_prompt, call_llm, create_judge_evaluation
    from .judge_agents import evaluate_validation_decision
    from .enhanced_judge_system import (
        start_agent_evaluation, record_performance_metric, judge_agent_output,
        finalize_agent_evaluation, AgentType, MetricType
    )
except ImportError:
    # Fallback when running as main module
    import sys
    sys.path.append('.')
    from langfuse_integration import get_prompt, call_llm, create_judge_evaluation
    from judge_agents import evaluate_validation_decision
    from enhanced_judge_system import (
        start_agent_evaluation, record_performance_metric, judge_agent_output,
        finalize_agent_evaluation, AgentType, MetricType
    )

class ValidationResult(Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_REVIEW = "needs_review"

class ValidationReason(Enum):
    VALID_MATERIAL = "valid_material"
    VALID_EQUIPMENT = "valid_equipment"
    INAPPROPRIATE_CONTENT = "inappropriate_content"
    NOT_MATERIAL_OR_EQUIPMENT = "not_material_or_equipment"
    PROFANITY_DETECTED = "profanity_detected"
    SPAM_DETECTED = "spam_detected"
    UNCLEAR_CLASSIFICATION = "unclear_classification"

class ItemValidationTool(BaseTool):
    name: str = "item_validator"
    description: str = "Validates if submitted items are appropriate materials or equipment"
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
    def _run(self, item_name: str, item_description: str = "", context: str = "") -> str:
        """
        Validate an item submission using LLM with Langfuse prompts and comprehensive evaluation
        """
        import time
        
        # Start comprehensive evaluation
        session_id = f"validator_{hash(item_name)}_{int(time.time())}"
        start_agent_evaluation(
            session_id,
            AgentType.VALIDATOR,
            {
                "item_name": item_name,
                "item_description": item_description,
                "context": context
            }
        )
        
        start_time = time.time()
        
        try:
            # Try LLM-based validation first
            llm_result = self._llm_validation(item_name, item_description, context, session_id)
            
            # Record performance metrics
            validation_time = time.time() - start_time
            record_performance_metric(session_id, MetricType.RESPONSE_TIME, validation_time)
            
            if llm_result:
                # Record accuracy based on confidence
                record_performance_metric(session_id, MetricType.CONFIDENCE, llm_result.get("confidence", 0))
                
                # Judge the validation output
                judge_agent_output(session_id, llm_result)
                finalize_agent_evaluation(session_id)
                
                return json.dumps(llm_result)
            
            # Fallback to rule-based validation
            print("⚠️ LLM validation unavailable, using rule-based fallback")
            result = self._rule_based_validation(item_name, item_description)
            
            # Record metrics for fallback
            record_performance_metric(session_id, MetricType.CONFIDENCE, result.get("confidence", 0))
            record_performance_metric(session_id, MetricType.ERROR_RATE, 1.0)  # Mark as degraded
            
            judge_agent_output(session_id, result)
            finalize_agent_evaluation(session_id)
            
            return json.dumps(result)
            
        except Exception as e:
            validation_time = time.time() - start_time
            record_performance_metric(session_id, MetricType.RESPONSE_TIME, validation_time)
            record_performance_metric(session_id, MetricType.ERROR_RATE, 1.0)
            
            error_result = {
                "decision": ValidationResult.NEEDS_REVIEW.value,
                "confidence": 0.0,
                "reason": "validation_error",
                "details": f"Error during validation: {str(e)}"
            }
            
            judge_agent_output(session_id, error_result)
            finalize_agent_evaluation(session_id)
            
            return json.dumps(error_result)
    
    def _llm_validation(self, item_name: str, item_description: str, context: str, session_id: str = None) -> Optional[Dict[str, Any]]:
        """
        Use LLM for validation with Langfuse prompt management
        """
        try:
            # Get prompt from Langfuse
            prompt = get_prompt(
                "item_validator_system",
                item_name=item_name,
                item_description=item_description or "No description provided",
                context=context or "No additional context"
            )
            
            # Make LLM call with Langfuse tracing
            response = call_llm(
                prompt=prompt,
                model="gpt-4o-mini",
                temperature=0.1,
                max_tokens=500,
                trace_name="item_validation",
                metadata={
                    "item_name": item_name,
                    "description_length": len(item_description) if item_description else 0,
                    "context_provided": bool(context)
                }
            )
            
            if not response:
                return None
                
            # Parse LLM response
            try:
                # Extract JSON from LLM response
                import re
                json_match = re.search(r'\{[^{}]*"decision"[^{}]*\}', response)
                if json_match:
                    result = json.loads(json_match.group())
                    
                    # Validate required fields
                    required_fields = ["decision", "confidence", "reason", "details"]
                    if all(field in result for field in required_fields):
                        # Run judge evaluation for this validation decision
                        try:
                            judge_result = evaluate_validation_decision(
                                item_data={
                                    "name": item_name,
                                    "description": item_description,
                                    "context": context
                                },
                                validation_result=result,
                                human_feedback=None  # Could be added later via API
                            )
                            
                            # Log both primary result and judge evaluation to Langfuse
                            confidence_score = float(result.get("confidence", 0))
                            create_judge_evaluation(
                                name="item_validation_quality",
                                input_data={
                                    "item_name": item_name,
                                    "description": item_description,
                                    "context": context
                                },
                                output_data=result,
                                score=confidence_score,
                                comment=f"LLM validation: {result['decision']} - {result['reason']}"
                            )
                            
                            # Log judge evaluation
                            create_judge_evaluation(
                                name="validation_judge_assessment",
                                input_data={
                                    "item_name": item_name,
                                    "agent_decision": result['decision'],
                                    "agent_reasoning": result['details']
                                },
                                output_data={
                                    "judge_score": judge_result.score,
                                    "judge_reasoning": judge_result.reasoning,
                                    "recommendations": judge_result.recommendations
                                },
                                score=judge_result.score,
                                comment=f"Judge assessment: {judge_result.reasoning}"
                            )
                            
                            # Add judge feedback to result
                            result["judge_assessment"] = {
                                "score": judge_result.score,
                                "confidence": judge_result.confidence,
                                "reasoning": judge_result.reasoning,
                                "recommendations": judge_result.recommendations
                            }
                            
                        except Exception as judge_error:
                            print(f"⚠️ Judge evaluation failed: {judge_error}")
                        
                        return result
                    else:
                        print(f"⚠️ LLM response missing required fields: {result}")
                        return None
                else:
                    print(f"⚠️ Could not extract JSON from LLM response: {response}")
                    return None
                    
            except (json.JSONDecodeError, ValueError) as parse_error:
                print(f"⚠️ Failed to parse LLM response: {parse_error}")
                return None
                
        except Exception as e:
            print(f"❌ LLM validation failed: {e}")
            return None
    
    
    def _rule_based_validation(self, item_name: str, description: str) -> Dict[str, Any]:
        """
        Fallback rule-based validation when LLM is not available
        """
        name_lower = item_name.lower()
        desc_lower = description.lower() if description else ""
        combined = f"{name_lower} {desc_lower}".strip()
        
        # Check for obvious inappropriate content
        inappropriate_keywords = [
            "fuck", "shit", "damn", "porn", "sex", "drug", "weapon", "gun", 
            "bomb", "kill", "hate", "racist", "nazi", "terrorism"
        ]
        
        if any(word in combined for word in inappropriate_keywords):
            return {
                "decision": ValidationResult.REJECTED.value,
                "confidence": 0.95,
                "reason": ValidationReason.PROFANITY_DETECTED.value,
                "details": "Inappropriate language detected"
            }
        
        # Check for non-material/equipment items
        non_facility_keywords = [
            "food", "pizza", "burger", "coffee", "beer", "wine", "candy",
            "clothing", "shirt", "pants", "shoes", "jewelry", "watch",
            "phone", "laptop", "computer", "game", "toy", "book", "magazine"
        ]
        
        if any(word in combined for word in non_facility_keywords):
            return {
                "decision": ValidationResult.REJECTED.value,
                "confidence": 0.8,
                "reason": ValidationReason.NOT_MATERIAL_OR_EQUIPMENT.value,
                "details": f"'{item_name}' appears to be unrelated to facility management"
            }
        
        # Check for valid facility/construction terms
        facility_keywords = [
            "pipe", "wire", "screw", "bolt", "nail", "tool", "wrench", "hammer",
            "drill", "saw", "plumbing", "electrical", "hvac", "paint", "lumber",
            "concrete", "steel", "copper", "pvc", "valve", "fitting", "switch",
            "outlet", "breaker", "fuse", "duct", "filter", "pump", "motor",
            "bearing", "gasket", "seal", "hose", "cable", "conduit", "panel",
            "gauge", "meter", "sensor", "thermostat", "compressor", "fan",
            "light", "fixture", "bulb", "ballast", "transformer", "generator"
        ]
        
        if any(word in combined for word in facility_keywords):
            return {
                "decision": ValidationResult.APPROVED.value,
                "confidence": 0.8,
                "reason": ValidationReason.VALID_MATERIAL.value,
                "details": f"'{item_name}' appears to be a valid facility management item"
            }
        
        # If unclear, flag for human review
        return {
            "decision": ValidationResult.NEEDS_REVIEW.value,
            "confidence": 0.5,
            "reason": ValidationReason.UNCLEAR_CLASSIFICATION.value,
            "details": f"Unable to clearly classify '{item_name}' - needs human review"
        }

class ValidationAgentCreator:
    def __init__(self):
        print("🔧 Initializing ValidationAgentCreator with Langfuse integration")
        
        # Create validation tool (now uses global Langfuse integration)
        self.validation_tool = ItemValidationTool()
    
    def create_validation_agent(self) -> Agent:
        """Create the item validation agent with Langfuse-managed prompts"""
        
        # Get agent backstory from Langfuse
        backstory = get_prompt("item_validator_backstory") or (
            'You are a vigilant guardian of data quality in a facility management system. '
            'Your mission is to catch inappropriate submissions, spam, and non-facility items '
            'while allowing legitimate materials and equipment through. Users will try to '
            'test your limits by submitting random items, personal belongings, inappropriate '
            'content, or completely unrelated things. Stay sharp and protect the system!'
        )
        
        return Agent(
            role='Item Validator',
            goal='Validate user-submitted items to ensure they are appropriate materials or equipment for facility management',
            backstory=backstory,
            tools=[self.validation_tool],
            verbose=True,
            allow_delegation=False
        )
    
    def create_validation_task(self, agent: Agent, item_data: Dict[str, Any]) -> Task:
        """Create a validation task for an item submission"""
        
        return Task(
            description=(
                f"Validate the following item submission:\n"
                f"Name: {item_data.get('name', 'Unknown')}\n"
                f"Description: {item_data.get('description', 'No description')}\n"
                f"Category: {item_data.get('category', 'Not specified')}\n"
                f"Submitted by: {item_data.get('user_id', 'Anonymous')}\n\n"
                f"Determine if this is a legitimate facility management item or if it should be rejected. "
                f"Be especially vigilant for test submissions, inappropriate content, or items unrelated to "
                f"construction, maintenance, or facility operations."
            ),
            expected_output=(
                "A JSON validation result with decision (approved/rejected/needs_review), "
                "confidence score, reason code, and detailed explanation"
            ),
            agent=agent
        )
    
    def create_validation_crew(self, item_data: Dict[str, Any]) -> Crew:
        """Create a crew for validating item submissions"""
        
        agent = self.create_validation_agent()
        task = self.create_validation_task(agent, item_data)
        
        return Crew(
            agents=[agent],
            tasks=[task],
            verbose=True,
            process='sequential'
        )
    
    def setup_langfuse_prompts(self):
        """Set up default prompts in Langfuse"""
        if not self.langfuse:
            print("Langfuse not available - cannot set up prompts")
            return
        
        try:
            # Create the validation prompt
            validation_prompt = """
You are an expert item validator for a facilities management system. Your job is to determine if user-submitted items are legitimate materials or equipment that would be used in building maintenance, construction, or facility operations.

ITEM TO VALIDATE:
Name: {{item_name}}
Description: {{item_description}}
Context: {{context}}

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
{
  "decision": "approved|rejected|needs_review",
  "confidence": 0.0-1.0,
  "reason": "reason_code",
  "details": "explanation of the decision"
}
"""
            
            self.langfuse.create_prompt(
                name="item_validation_v1",
                prompt=validation_prompt,
                labels=["validation", "facility_management", "content_filtering"]
            )
            
            print("✅ Langfuse prompts created successfully")
            
        except Exception as e:
            print(f"❌ Failed to create Langfuse prompts: {e}")

# Example usage and testing
if __name__ == "__main__":
    # Create validation system
    validator = ValidationAgentCreator()
    
    # Set up prompts in Langfuse
    validator.setup_langfuse_prompts()
    
    # Test cases to validate the abuse detection
    test_cases = [
        {"name": "PVC Pipe", "description": "1/2 inch PVC pipe for plumbing", "category": "plumbing"},
        {"name": "Pizza", "description": "Delicious pepperoni pizza", "category": "food"},
        {"name": "Fucking wrench", "description": "This is inappropriate", "category": "tools"},
        {"name": "Wire nuts", "description": "Electrical wire connectors", "category": "electrical"},
        {"name": "My laptop", "description": "Personal computer", "category": "electronics"},
        {"name": "Drill bits", "description": "Set of metal drill bits", "category": "tools"},
        {"name": "Random garbage text", "description": "asdkfjaslkdfj", "category": "unknown"}
    ]
    
    print("\n🧪 Testing validation system...")
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n--- Test {i}: {test_case['name']} ---")
        
        # Create crew for this item
        crew = validator.create_validation_crew(test_case)
        
        # Run validation
        try:
            result = crew.kickoff()
            print(f"Result: {result}")
        except Exception as e:
            print(f"Error: {e}")