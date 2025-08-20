import os
from typing import Optional
from openai import OpenAI


class OpenRouterClient:
    """OpenAI-compatible client for OpenRouter hosted service"""
    
    def __init__(self):
        self.api_key = os.getenv('OPENROUTER_API_KEY')
        self.model = os.getenv('OPENROUTER_MODEL', 'anthropic/claude-3.5-sonnet')
        self.base_url = 'https://openrouter.ai/api/v1'
        self._client: Optional[OpenAI] = None
        self._initialized = False
    
    def _get_client(self) -> OpenAI:
        """Get or create OpenAI client"""
        if not self._initialized:
            self._initialize_client()
        
        if self._client is None:
            raise RuntimeError(
                "OpenRouter client not available. Please set OPENROUTER_API_KEY environment variable."
            )
        
        return self._client
    
    def _initialize_client(self):
        """Initialize the OpenAI client for OpenRouter"""
        self._initialized = True
        
        if not self.api_key:
            print("OPENROUTER_API_KEY not set, LLM functionality disabled")
            self._client = None
            return
        
        try:
            self._client = OpenAI(
                base_url=self.base_url,
                api_key=self.api_key
            )
            print(f"OpenRouter client initialized with model: {self.model}")
        except Exception as e:
            print(f"Failed to initialize OpenRouter client: {e}")
            self._client = None
    
    def chat_completion(self, messages: list, model: Optional[str] = None, **kwargs):
        """Create chat completion using configured model"""
        client = self._get_client()
        
        # Use provided model or default configured model
        model_name = model or self.model
        
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                **kwargs
            )
            return response
        except Exception as e:
            print(f"OpenRouter chat completion failed: {e}")
            raise
    
    def is_available(self) -> bool:
        """Check if OpenRouter client is available"""
        return self.api_key is not None and self._client is not None
    
    def get_model_alias(self) -> str:
        """Get current model name"""
        return self.model


# Global client instance
_openrouter_client: Optional[OpenRouterClient] = None


def get_llm() -> OpenRouterClient:
    """Get global OpenRouter client instance"""
    global _openrouter_client
    
    if _openrouter_client is None:
        _openrouter_client = OpenRouterClient()
    
    return _openrouter_client


def health_check() -> dict:
    """Health check for OpenRouter integration"""
    client = get_llm()
    
    return {
        'openrouter_api_key': 'set' if client.api_key else 'not set',
        'model': client.model,
        'base_url': client.base_url,
        'client_available': client.is_available(),
        'initialized': client._initialized
    }