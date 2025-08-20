import pytest
import os
from unittest.mock import patch, MagicMock
from llm.client import get_llm, health_check, OpenRouterClient


class TestOpenRouterClient:
    """Smoke tests for OpenRouter client integration"""
    
    def setup_method(self):
        """Setup for each test"""
        # Reset global client
        import llm.client
        llm.client._openrouter_client = None
    
    def test_client_creation_with_env(self):
        """Test client returns when env vars are present"""
        
        with patch.dict(os.environ, {
            'OPENROUTER_API_KEY': 'sk-or-v1-test-key',
            'OPENROUTER_MODEL': 'anthropic/claude-3.5-sonnet'
        }):
            client = get_llm()
            
            assert client is not None
            assert isinstance(client, OpenRouterClient)
            assert client.base_url == 'https://openrouter.ai/api/v1'
            assert client.model == 'anthropic/claude-3.5-sonnet'
            assert client.api_key == 'sk-or-v1-test-key'
    
    def test_client_missing_api_key_no_crash(self):
        """Test client doesn't crash when API key missing until called"""
        
        with patch.dict(os.environ, {}, clear=True):
            client = get_llm()
            
            # Should create client without crashing
            assert client is not None
            assert client.api_key is None
            assert not client.is_available()
            
            # Should only crash when trying to use it
            with pytest.raises(RuntimeError, match="OpenRouter client not available"):
                client.chat_completion([{"role": "user", "content": "test"}])
    
    @patch('llm.client.OpenAI')
    def test_client_initialization_success(self, mock_openai_class):
        """Test successful client initialization"""
        
        mock_openai_instance = MagicMock()
        mock_openai_class.return_value = mock_openai_instance
        
        with patch.dict(os.environ, {
            'OPENROUTER_API_KEY': 'sk-or-v1-test-key',
            'OPENROUTER_MODEL': 'openai/gpt-4o-mini'
        }):
            client = get_llm()
            
            # Force initialization
            _ = client.is_available()
            
            # Should have called OpenAI constructor
            mock_openai_class.assert_called_once_with(
                base_url='https://openrouter.ai/api/v1',
                api_key='sk-or-v1-test-key'
            )
            
            assert client.is_available()
            assert client.get_model_alias() == 'openai/gpt-4o-mini'
    
    @patch('llm.client.OpenAI')
    def test_chat_completion_call(self, mock_openai_class):
        """Test chat completion method"""
        
        # Mock OpenAI client and response
        mock_openai_instance = MagicMock()
        mock_openai_class.return_value = mock_openai_instance
        
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test response"
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 5
        
        mock_openai_instance.chat.completions.create.return_value = mock_response
        
        with patch.dict(os.environ, {
            'OPENROUTER_API_KEY': 'sk-or-v1-test-key',
            'OPENROUTER_MODEL': 'anthropic/claude-3.5-sonnet'
        }):
            client = get_llm()
            
            # Make chat completion call
            messages = [{"role": "user", "content": "Hello"}]
            response = client.chat_completion(messages, temperature=0.5)
            
            # Verify call was made correctly
            mock_openai_instance.chat.completions.create.assert_called_once_with(
                model='anthropic/claude-3.5-sonnet',
                messages=messages,
                temperature=0.5
            )
            
            assert response == mock_response
    
    @patch('llm.client.OpenAI')
    def test_chat_completion_with_custom_model(self, mock_openai_class):
        """Test chat completion with custom model override"""
        
        mock_openai_instance = MagicMock()
        mock_openai_class.return_value = mock_openai_instance
        
        mock_response = MagicMock()
        mock_openai_instance.chat.completions.create.return_value = mock_response
        
        with patch.dict(os.environ, {
            'OPENROUTER_API_KEY': 'sk-or-v1-test-key',
            'OPENROUTER_MODEL': 'anthropic/claude-3.5-sonnet'
        }):
            client = get_llm()
            
            # Call with custom model
            messages = [{"role": "user", "content": "Hello"}]
            client.chat_completion(messages, model='openai/gpt-4o-mini')
            
            # Should use custom model, not default
            mock_openai_instance.chat.completions.create.assert_called_once()
            call_args = mock_openai_instance.chat.completions.create.call_args[1]
            assert call_args['model'] == 'openai/gpt-4o-mini'
    
    @patch('llm.client.OpenAI')
    def test_initialization_failure(self, mock_openai_class):
        """Test graceful handling of initialization failure"""
        
        mock_openai_class.side_effect = Exception("Connection failed")
        
        with patch.dict(os.environ, {
            'OPENROUTER_API_KEY': 'sk-or-v1-test-key'
        }):
            client = get_llm()
            
            # Should not crash on creation
            assert client is not None
            assert not client.is_available()
            
            # Should raise clear error when trying to use
            with pytest.raises(RuntimeError, match="OpenRouter client not available"):
                client.chat_completion([{"role": "user", "content": "test"}])
    
    def test_health_check_function(self):
        """Test health check function"""
        
        with patch.dict(os.environ, {
            'OPENROUTER_API_KEY': 'sk-or-v1-test-key',
            'OPENROUTER_MODEL': 'test-model'
        }):
            health = health_check()
            
            assert 'openrouter_api_key' in health
            assert 'model' in health
            assert 'base_url' in health
            assert 'client_available' in health
            assert 'initialized' in health
            
            assert health['openrouter_api_key'] == 'set'
            assert health['model'] == 'test-model'
            assert health['base_url'] == 'https://openrouter.ai/api/v1'
    
    def test_global_client_singleton(self):
        """Test that get_llm returns same instance"""
        
        client1 = get_llm()
        client2 = get_llm()
        
        assert client1 is client2
    
    def test_default_values(self):
        """Test default values when env vars missing"""
        
        with patch.dict(os.environ, {}, clear=True):
            client = get_llm()
            
            assert client.base_url == 'https://openrouter.ai/api/v1'
            assert client.model == 'anthropic/claude-3.5-sonnet'  # Default
            assert client.api_key is None
    
    @patch('llm.client.OpenAI')
    def test_chat_completion_error_propagation(self, mock_openai_class):
        """Test that chat completion errors are properly propagated"""
        
        mock_openai_instance = MagicMock()
        mock_openai_class.return_value = mock_openai_instance
        
        # Mock API error
        mock_openai_instance.chat.completions.create.side_effect = Exception("API Error")
        
        with patch.dict(os.environ, {
            'OPENROUTER_API_KEY': 'sk-or-v1-test-key'
        }):
            client = get_llm()
            
            # Should propagate the exception
            with pytest.raises(Exception, match="API Error"):
                client.chat_completion([{"role": "user", "content": "test"}])


if __name__ == '__main__':
    pytest.main([__file__, '-v'])