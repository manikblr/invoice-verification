import pytest
import os
from unittest.mock import patch, MagicMock
from obs.langfuse_client import start_trace, with_span, get_trace_id, is_tracing_enabled, _redact_sensitive_data


class TestObservabilitySmoke:
    """Smoke tests for Langfuse observability integration"""
    
    def setup_method(self):
        """Setup for each test"""
        # Reset global state
        import obs.langfuse_client
        obs.langfuse_client._initialized = False
        obs.langfuse_client.lf = None
    
    def test_start_trace_no_env(self):
        """Test start_trace returns object when env vars missing"""
        
        # Ensure no Langfuse env vars
        with patch.dict(os.environ, {}, clear=True):
            trace = start_trace("test_operation", user_id="test_user")
            
            # Should return a dummy trace, not None
            assert trace is not None
            assert hasattr(trace, 'id')
            
            # Should be able to get trace ID
            trace_id = get_trace_id(trace)
            assert trace_id is not None
            assert isinstance(trace_id, str)
    
    def test_with_span_no_crash(self):
        """Test with_span doesn't crash with dummy env"""
        
        with patch.dict(os.environ, {}, clear=True):
            trace = start_trace("test_operation")
            
            # Should not crash
            with with_span(trace, "test_span", 
                          input_data={'test': 'input'}, 
                          metadata={'test': 'meta'}) as span:
                
                # Should be able to use span result
                assert span is not None
                assert 'output' in span
                assert 'metadata' in span
                
                # Can set output
                span['output'] = {'test': 'output'}
    
    def test_tracing_with_mock_langfuse(self):
        """Test tracing with mocked Langfuse"""
        
        # Mock Langfuse class
        mock_langfuse_class = MagicMock()
        mock_langfuse_instance = MagicMock()
        mock_langfuse_class.return_value = mock_langfuse_instance
        
        # Mock trace
        mock_trace = MagicMock()
        mock_trace.id = "test_trace_123"
        mock_langfuse_instance.trace.return_value = mock_trace
        
        # Mock span
        mock_span = MagicMock()
        mock_trace.span.return_value = mock_span
        
        with patch.dict(os.environ, {
            'LANGFUSE_PUBLIC_KEY': 'pk_test',
            'LANGFUSE_SECRET_KEY': 'sk_test',
            'LANGFUSE_HOST': 'https://test.langfuse.com'
        }):
            with patch('obs.langfuse_client.Langfuse', mock_langfuse_class):
                
                # Start trace
                trace = start_trace("test_operation", user_id="user123", 
                                  metadata={'test': 'metadata'})
                
                assert trace is not None
                
                # Verify Langfuse was called correctly
                mock_langfuse_class.assert_called_once_with(
                    public_key='pk_test',
                    secret_key='sk_test',
                    host='https://test.langfuse.com'
                )
                
                mock_langfuse_instance.trace.assert_called_once()
                call_args = mock_langfuse_instance.trace.call_args[1]
                assert call_args['name'] == "test_operation"
                assert call_args['user_id'] == "user123"
                
                # Get trace ID
                trace_id = get_trace_id(trace)
                assert trace_id == "test_trace_123"
                
                # Test span
                with with_span(trace, "test_span", input_data={'key': 'value'}) as span:
                    span['output'] = {'result': 'success'}
                
                # Verify span was created
                mock_trace.span.assert_called_once()
                mock_span.update.assert_called()
                mock_span.end.assert_called()
    
    def test_data_redaction(self):
        """Test sensitive data redaction"""
        
        # Test string redaction (>1k chars)
        long_string = "x" * 1500
        redacted = _redact_sensitive_data(long_string)
        
        assert "REDACTED_STRING" in redacted
        assert "length=1500" in redacted
        assert "hash=" in redacted
        
        # Test sensitive field redaction
        sensitive_data = {
            'description': 'sensitive product description',
            'reason': 'some reasoning text',
            'q': 'search query',
            'vendor_id': 'VENDOR_123',
            'safe_field': 'this should remain',
            'unit_price': 99.99
        }
        
        redacted = _redact_sensitive_data(sensitive_data)
        
        # Sensitive fields should be hashed/redacted
        assert 'description' not in redacted
        assert 'description_hash' in redacted
        assert 'description_length' in redacted
        
        assert 'reason' not in redacted
        assert 'reason_hash' in redacted
        
        assert 'q' not in redacted
        assert 'q_hash' in redacted
        
        assert 'vendor_id' not in redacted
        assert 'vendor_id_hash' in redacted
        
        # Safe fields should remain
        assert redacted['safe_field'] == 'this should remain'
        assert redacted['unit_price'] == 99.99
    
    def test_tracing_enabled_detection(self):
        """Test is_tracing_enabled function"""
        
        # Without env vars
        with patch.dict(os.environ, {}, clear=True):
            assert is_tracing_enabled() == False
        
        # With env vars but mock import error
        with patch.dict(os.environ, {
            'LANGFUSE_PUBLIC_KEY': 'pk_test',
            'LANGFUSE_SECRET_KEY': 'sk_test'
        }):
            with patch('obs.langfuse_client.Langfuse', side_effect=ImportError()):
                assert is_tracing_enabled() == False
    
    def test_nested_data_redaction(self):
        """Test redaction works on nested data structures"""
        
        nested_data = {
            'top_level': {
                'description': 'nested sensitive text',
                'metadata': {
                    'q': 'deep search query',
                    'items': [
                        {'description': 'item 1 desc'},
                        {'name': 'safe item name'}
                    ]
                }
            },
            'vendor_id': 'VENDOR_456'
        }
        
        redacted = _redact_sensitive_data(nested_data)
        
        # Check nested redaction
        assert 'description_hash' in redacted['top_level']
        assert 'q_hash' in redacted['top_level']['metadata']
        assert 'description_hash' in redacted['top_level']['metadata']['items'][0]
        assert redacted['top_level']['metadata']['items'][1]['name'] == 'safe item name'
        assert 'vendor_id_hash' in redacted
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_api_response_includes_trace_id(self, mock_supabase_client):
        """Test that API response includes trace_id"""
        
        from api.agent_run_crew import app
        
        # Mock Supabase client
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock empty responses
        mock_client.table.return_value.select.return_value.execute.return_value.data = []
        mock_client.table.return_value.insert.return_value.execute.return_value = None
        
        # Create test client
        with app.test_client() as client:
            
            # Test request
            response = client.post('/api/agent_run_crew', 
                                 json={
                                     'invoice_id': 'test_invoice_123',
                                     'vendor_id': 'test_vendor',
                                     'items': [
                                         {
                                             'id': 'item_1',
                                             'description': 'test item',
                                             'quantity': 1,
                                             'unit_price': 10.0
                                         }
                                     ]
                                 },
                                 headers={'Content-Type': 'application/json'})
            
            # Should return 200 (even with mocked data)
            assert response.status_code == 200
            
            # Parse response
            data = response.get_json()
            
            # Should have trace_id
            assert 'trace_id' in data
            assert data['trace_id'] is not None
            assert isinstance(data['trace_id'], str)
    
    def test_span_error_handling(self):
        """Test span handles errors gracefully"""
        
        with patch.dict(os.environ, {}, clear=True):
            trace = start_trace("test_operation")
            
            # Should handle exceptions in span
            try:
                with with_span(trace, "error_span", input_data={'test': 'input'}) as span:
                    span['output'] = {'before_error': True}
                    raise ValueError("Test error")
            except ValueError:
                pass  # Expected
            
            # Should not crash the application
            assert True


if __name__ == '__main__':
    pytest.main([__file__, '-v'])