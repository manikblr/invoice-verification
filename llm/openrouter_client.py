"""
OpenRouter Client for Flexible Model Selection
Provides unified interface for multiple LLM providers through OpenRouter
"""

import os
import json
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    openai = None

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

class ModelTier(Enum):
    """Model tiers for different use cases"""
    FAST = "fast"           # Quick responses, lower cost
    STANDARD = "standard"   # Balanced performance and cost
    PREMIUM = "premium"     # High quality, higher cost
    REASONING = "reasoning" # Complex reasoning tasks

@dataclass
class ModelConfig:
    """Configuration for a specific model"""
    name: str
    provider: str
    tier: ModelTier
    cost_per_1k_tokens: float
    max_tokens: int
    context_window: int
    supports_streaming: bool = True
    supports_function_calling: bool = False

class OpenRouterClient:
    """
    OpenRouter client for accessing multiple LLM providers
    Provides model selection, cost optimization, and fallback handling
    """
    
    def __init__(self):
        self.api_key = os.getenv('OPENROUTER_API_KEY')
        self.base_url = "https://openrouter.ai/api/v1"
        self.client = None
        
        # Model configurations
        self.models = self._initialize_model_configs()
        
        # Environment-based model selection
        self.default_model = os.getenv('OPENROUTER_MODEL', 'openai/gpt-4o-mini')
        self.judge_model = os.getenv('OPENROUTER_JUDGE_MODEL', 'openai/gpt-4o')
        self.fallback_model = os.getenv('OPENROUTER_FALLBACK_MODEL', 'anthropic/claude-3-haiku')
        
        self._initialize_client()
    
    def _initialize_model_configs(self) -> Dict[str, ModelConfig]:
        """Initialize available model configurations"""
        return {
            # OpenAI Models
            'openai/gpt-4o': ModelConfig(
                name='openai/gpt-4o',
                provider='openai',
                tier=ModelTier.PREMIUM,
                cost_per_1k_tokens=0.005,
                max_tokens=4096,
                context_window=128000,
                supports_function_calling=True
            ),
            'openai/gpt-4o-mini': ModelConfig(
                name='openai/gpt-4o-mini',
                provider='openai',
                tier=ModelTier.STANDARD,
                cost_per_1k_tokens=0.0001,
                max_tokens=16384,
                context_window=128000,
                supports_function_calling=True
            ),
            'openai/gpt-3.5-turbo': ModelConfig(
                name='openai/gpt-3.5-turbo',
                provider='openai',
                tier=ModelTier.FAST,
                cost_per_1k_tokens=0.0005,
                max_tokens=4096,
                context_window=16385,
                supports_function_calling=True
            ),
            
            # Anthropic Models
            'anthropic/claude-3-opus': ModelConfig(
                name='anthropic/claude-3-opus',
                provider='anthropic',
                tier=ModelTier.PREMIUM,
                cost_per_1k_tokens=0.015,
                max_tokens=4096,
                context_window=200000
            ),
            'anthropic/claude-3-sonnet': ModelConfig(
                name='anthropic/claude-3-sonnet',
                provider='anthropic',
                tier=ModelTier.STANDARD,
                cost_per_1k_tokens=0.003,
                max_tokens=4096,
                context_window=200000
            ),
            'anthropic/claude-3-haiku': ModelConfig(
                name='anthropic/claude-3-haiku',
                provider='anthropic',
                tier=ModelTier.FAST,
                cost_per_1k_tokens=0.00025,
                max_tokens=4096,
                context_window=200000
            ),
            
            # Google Models
            'google/gemini-pro': ModelConfig(
                name='google/gemini-pro',
                provider='google',
                tier=ModelTier.STANDARD,
                cost_per_1k_tokens=0.0005,
                max_tokens=2048,
                context_window=32000
            ),
            'google/gemini-flash': ModelConfig(
                name='google/gemini-flash',
                provider='google',
                tier=ModelTier.FAST,
                cost_per_1k_tokens=0.0001,
                max_tokens=8192,
                context_window=1000000
            ),
            
            # Meta Models
            'meta-llama/llama-3.1-8b-instruct': ModelConfig(
                name='meta-llama/llama-3.1-8b-instruct',
                provider='meta',
                tier=ModelTier.FAST,
                cost_per_1k_tokens=0.0001,
                max_tokens=8192,
                context_window=131072
            ),
            'meta-llama/llama-3.1-70b-instruct': ModelConfig(
                name='meta-llama/llama-3.1-70b-instruct',
                provider='meta',
                tier=ModelTier.STANDARD,
                cost_per_1k_tokens=0.0009,
                max_tokens=8192,
                context_window=131072
            ),
            
            # Mistral Models
            'mistralai/mistral-7b-instruct': ModelConfig(
                name='mistralai/mistral-7b-instruct',
                provider='mistral',
                tier=ModelTier.FAST,
                cost_per_1k_tokens=0.0001,
                max_tokens=8192,
                context_window=32768
            ),
            'mistralai/mixtral-8x7b-instruct': ModelConfig(
                name='mistralai/mixtral-8x7b-instruct',
                provider='mistral',
                tier=ModelTier.STANDARD,
                cost_per_1k_tokens=0.0005,
                max_tokens=8192,
                context_window=32768
            )
        }
    
    def _initialize_client(self):
        """Initialize OpenAI client with OpenRouter configuration"""
        if not OPENAI_AVAILABLE:
            print("⚠️ OpenAI library not available")
            return
        
        if not self.api_key:
            print("⚠️ OpenRouter API key not configured")
            return
        
        try:
            self.client = openai.OpenAI(
                api_key=self.api_key,
                base_url=self.base_url
            )
            print("✅ OpenRouter client initialized")
        except Exception as e:
            print(f"❌ Failed to initialize OpenRouter client: {e}")
            self.client = None
    
    def get_model_for_task(self, task_type: str, tier: Optional[ModelTier] = None) -> str:
        """Get appropriate model for specific task type"""
        
        # Task-specific model selection
        task_models = {
            'validation': self.default_model,
            'matching': self.default_model,
            'pricing': self.default_model,
            'rules': self.default_model,
            'judging': self.judge_model,
            'reasoning': self.judge_model,
            'analysis': self.judge_model,
            'fallback': self.fallback_model
        }
        
        # Get task-specific model or default
        model = task_models.get(task_type, self.default_model)
        
        # Override with tier-specific model if requested
        if tier and tier != ModelTier.STANDARD:
            tier_models = self._get_models_by_tier(tier)
            if tier_models:
                model = tier_models[0]  # Use first available model in tier
        
        return model
    
    def _get_models_by_tier(self, tier: ModelTier) -> List[str]:
        """Get available models for a specific tier"""
        return [
            model.name for model in self.models.values() 
            if model.tier == tier
        ]
    
    def call_llm(
        self,
        prompt: str,
        model: Optional[str] = None,
        task_type: str = "general",
        temperature: float = 0.1,
        max_tokens: int = 1000,
        tier: Optional[ModelTier] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """
        Make LLM call through OpenRouter with automatic model selection
        """
        
        if not self.client:
            print("⚠️ OpenRouter client not available")
            return None
        
        # Select model
        if not model:
            model = self.get_model_for_task(task_type, tier)
        
        # Get model config for validation
        model_config = self.models.get(model)
        if model_config:
            # Validate max_tokens against model limits
            max_tokens = min(max_tokens, model_config.max_tokens)
        
        try:
            # Prepare request
            messages = [{"role": "user", "content": prompt}]
            
            # Add model-specific headers
            extra_headers = {
                "HTTP-Referer": "https://invoice-verification.app",
                "X-Title": "Invoice Verification System"
            }
            
            # Make the call
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                extra_headers=extra_headers
            )
            
            # Extract content
            content = response.choices[0].message.content
            
            # Log usage if available
            if hasattr(response, 'usage') and response.usage:
                usage_info = {
                    'model': model,
                    'prompt_tokens': response.usage.prompt_tokens,
                    'completion_tokens': response.usage.completion_tokens,
                    'total_tokens': response.usage.total_tokens
                }
                
                # Calculate cost if model config available
                if model_config:
                    estimated_cost = (usage_info['total_tokens'] / 1000) * model_config.cost_per_1k_tokens
                    usage_info['estimated_cost'] = estimated_cost
                
                print(f"📊 Usage: {usage_info}")
            
            return content
            
        except Exception as e:
            print(f"❌ OpenRouter call failed for model {model}: {e}")
            
            # Try fallback model if available
            if model != self.fallback_model:
                print(f"🔄 Trying fallback model: {self.fallback_model}")
                return self.call_llm(
                    prompt=prompt,
                    model=self.fallback_model,
                    task_type="fallback",
                    temperature=temperature,
                    max_tokens=max_tokens,
                    metadata=metadata
                )
            
            return None
    
    def get_available_models(self, tier: Optional[ModelTier] = None) -> List[Dict[str, Any]]:
        """Get list of available models, optionally filtered by tier"""
        
        models = []
        for model_name, config in self.models.items():
            if tier is None or config.tier == tier:
                models.append({
                    'name': model_name,
                    'provider': config.provider,
                    'tier': config.tier.value,
                    'cost_per_1k_tokens': config.cost_per_1k_tokens,
                    'max_tokens': config.max_tokens,
                    'context_window': config.context_window,
                    'supports_streaming': config.supports_streaming,
                    'supports_function_calling': config.supports_function_calling
                })
        
        return sorted(models, key=lambda x: x['cost_per_1k_tokens'])
    
    def estimate_cost(self, prompt: str, model: Optional[str] = None) -> Dict[str, Any]:
        """Estimate cost for a given prompt and model"""
        
        if not model:
            model = self.default_model
        
        model_config = self.models.get(model)
        if not model_config:
            return {'error': f'Model {model} not found'}
        
        # Rough token estimation (1 token ≈ 4 characters for English)
        estimated_tokens = len(prompt) // 4
        estimated_cost = (estimated_tokens / 1000) * model_config.cost_per_1k_tokens
        
        return {
            'model': model,
            'estimated_prompt_tokens': estimated_tokens,
            'estimated_cost': estimated_cost,
            'cost_per_1k_tokens': model_config.cost_per_1k_tokens
        }
    
    def health_check(self) -> Dict[str, Any]:
        """Check OpenRouter service health"""
        
        if not self.client:
            return {
                'status': 'unhealthy',
                'reason': 'Client not initialized',
                'api_key_configured': bool(self.api_key)
            }
        
        try:
            # Simple test call
            response = self.call_llm(
                "Say 'OK' and nothing else.",
                model=self.fallback_model,
                max_tokens=10
            )
            
            return {
                'status': 'healthy' if response and 'OK' in response else 'degraded',
                'test_response': response,
                'default_model': self.default_model,
                'judge_model': self.judge_model,
                'fallback_model': self.fallback_model,
                'total_models': len(self.models)
            }
            
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e),
                'api_key_configured': bool(self.api_key)
            }

# Global client instance
openrouter_client = OpenRouterClient()

# Convenience functions
def call_openrouter(prompt: str, **kwargs) -> Optional[str]:
    """Convenience function for OpenRouter calls"""
    return openrouter_client.call_llm(prompt, **kwargs)

def get_model_for_task(task_type: str, tier: Optional[ModelTier] = None) -> str:
    """Get appropriate model for task"""
    return openrouter_client.get_model_for_task(task_type, tier)

def estimate_cost(prompt: str, model: Optional[str] = None) -> Dict[str, Any]:
    """Estimate cost for prompt"""
    return openrouter_client.estimate_cost(prompt, model)

if __name__ == "__main__":
    # Test OpenRouter integration
    print("🧪 Testing OpenRouter Integration...")
    
    # Health check
    health = openrouter_client.health_check()
    print(f"Health Status: {health['status']}")
    
    # List available models
    models = openrouter_client.get_available_models()
    print(f"Available Models: {len(models)}")
    
    # Test different tiers
    for tier in ModelTier:
        tier_models = openrouter_client._get_models_by_tier(tier)
        print(f"{tier.value.title()} Models: {len(tier_models)}")
    
    # Test model selection
    for task in ['validation', 'judging', 'matching', 'pricing']:
        model = openrouter_client.get_model_for_task(task)
        print(f"Task '{task}' -> Model: {model}")
    
    # Test LLM call if healthy
    if health['status'] == 'healthy':
        response = openrouter_client.call_llm(
            "Say 'OpenRouter integration test successful' and nothing else.",
            task_type="validation"
        )
        print(f"Test Response: {response}")
    
    print("✅ OpenRouter integration test complete")