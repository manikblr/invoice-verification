import pytest
import json
import uuid
from unittest.mock import patch, MagicMock
from api.feedback import feedback_handler, FeedbackRequest


class TestFeedbackAPI:
    """Tests for feedback API"""
    
    def setup_method(self):
        """Setup for each test"""
        self.test_invoice_id = str(uuid.uuid4())
        self.test_line_item_id = "line_item_1"
        self.test_user = "test@example.com"
        self.test_proposal_id = str(uuid.uuid4())
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_records_feedback_only(self, mock_supabase_client):
        """Test case 1: Records feedback row without approval"""
        
        # Mock Supabase client
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock successful insert
        mock_insert_result = MagicMock()
        mock_insert_result.data = [{'id': 'feedback_123'}]
        mock_client.table.return_value.insert.return_value.execute.return_value = mock_insert_result
        
        # Create feedback request without proposal approval
        feedback_request = FeedbackRequest(
            invoice_id=self.test_invoice_id,
            line_item_id=self.test_line_item_id,
            decision="ALLOW",
            reason="Item looks correct",
            by_user=self.test_user
        )
        
        # Process feedback
        result = feedback_handler.record_feedback(feedback_request)
        
        # Assertions
        assert result['ok'] is True
        assert 'feedback_id' in result
        assert result['applied'] is None  # No proposal to apply
        
        # Verify insert was called with correct data
        mock_client.table.assert_called_with('human_feedback')
        insert_call = mock_client.table.return_value.insert.call_args[0][0]
        
        assert insert_call['invoice_id'] == self.test_invoice_id
        assert insert_call['line_item_id'] == self.test_line_item_id
        assert insert_call['decision'] == 'ALLOW'
        assert insert_call['reason'] == 'Item looks correct'
        assert insert_call['by_user'] == self.test_user
        assert insert_call['related_proposal_id'] is None
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_approves_new_synonym_proposal(self, mock_supabase_client):
        """Test case 2: Approves NEW_SYNONYM proposal (dry_run=false)"""
        
        # Mock Supabase client
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock proposal fetch
        mock_proposal_data = {
            'id': self.test_proposal_id,
            'proposal_type': 'NEW_SYNONYM',
            'status': 'PENDING',
            'payload': {
                'canonical_item_id': 'canonical_123',
                'synonym': 'office seat',
                'confidence': 0.85
            }
        }
        
        mock_proposal_response = MagicMock()
        mock_proposal_response.data = [mock_proposal_data]
        
        # Mock feedback insert
        mock_feedback_insert = MagicMock()
        mock_feedback_insert.data = [{'id': 'feedback_456'}]
        
        # Mock proposal update
        mock_proposal_update = MagicMock()
        mock_proposal_update.data = [{'id': self.test_proposal_id}]
        
        # Mock synonym existence check (empty = doesn't exist)
        mock_synonym_check = MagicMock()
        mock_synonym_check.data = []
        
        # Mock synonym insert
        mock_synonym_insert = MagicMock()
        mock_synonym_insert.data = [{'id': 'synonym_789'}]
        
        # Setup table responses
        def mock_table_response(table_name):
            mock_table = MagicMock()
            
            if table_name == 'human_feedback':
                mock_table.insert.return_value.execute.return_value = mock_feedback_insert
            elif table_name == 'agent_proposals':
                mock_table.select.return_value.eq.return_value.execute.return_value = mock_proposal_response
                mock_table.update.return_value.eq.return_value.execute.return_value = mock_proposal_update
            elif table_name == 'synonyms':
                # First call (check existence) returns empty, second call (insert) returns new record
                if not hasattr(mock_table, '_call_count'):
                    mock_table._call_count = 0
                mock_table._call_count += 1
                
                if mock_table._call_count == 1:
                    mock_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_synonym_check
                else:
                    mock_table.insert.return_value.execute.return_value = mock_synonym_insert
            
            return mock_table
        
        mock_client.table.side_effect = mock_table_response
        
        # Temporarily set dry_run to False for this test
        original_dry_run = feedback_handler.dry_run
        feedback_handler.dry_run = False
        
        try:
            # Create feedback request with proposal approval
            feedback_request = FeedbackRequest(
                invoice_id=self.test_invoice_id,
                line_item_id=self.test_line_item_id,
                decision="ALLOW",
                reason="Synonym looks good",
                by_user=self.test_user,
                approve_proposal_id=self.test_proposal_id
            )
            
            # Process feedback
            result = feedback_handler.record_feedback(feedback_request)
            
            # Assertions
            assert result['ok'] is True
            assert 'feedback_id' in result
            assert result['applied'] is not None
            
            applied = result['applied']
            assert applied['approved'] is True
            assert applied['type'] == 'NEW_SYNONYM'
            assert 'application' in applied
            
            application = applied['application']
            assert application['type'] == 'NEW_SYNONYM'
            assert application['created'] is True
            assert application['synonym'] == 'office seat'
            
        finally:
            # Restore original dry_run setting
            feedback_handler.dry_run = original_dry_run
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_idempotent_approval(self, mock_supabase_client):
        """Test case 3: Approving same proposal twice is safe (returns already_processed)"""
        
        # Mock Supabase client
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock already approved proposal
        mock_proposal_data = {
            'id': self.test_proposal_id,
            'proposal_type': 'NEW_SYNONYM',
            'status': 'APPROVED',  # Already approved
            'payload': {
                'canonical_item_id': 'canonical_123',
                'synonym': 'office seat',
                'confidence': 0.85
            }
        }
        
        mock_proposal_response = MagicMock()
        mock_proposal_response.data = [mock_proposal_data]
        
        # Mock feedback insert
        mock_feedback_insert = MagicMock()
        mock_feedback_insert.data = [{'id': 'feedback_456'}]
        
        # Setup table responses
        def mock_table_response(table_name):
            mock_table = MagicMock()
            
            if table_name == 'human_feedback':
                mock_table.insert.return_value.execute.return_value = mock_feedback_insert
            elif table_name == 'agent_proposals':
                mock_table.select.return_value.eq.return_value.execute.return_value = mock_proposal_response
            
            return mock_table
        
        mock_client.table.side_effect = mock_table_response
        
        # Create feedback request with proposal approval
        feedback_request = FeedbackRequest(
            invoice_id=self.test_invoice_id,
            line_item_id=self.test_line_item_id,
            decision="ALLOW",
            reason="Already approved test",
            by_user=self.test_user,
            approve_proposal_id=self.test_proposal_id
        )
        
        # Process feedback
        result = feedback_handler.record_feedback(feedback_request)
        
        # Assertions
        assert result['ok'] is True
        assert 'feedback_id' in result
        assert result['applied'] is not None
        
        applied = result['applied']
        assert applied['already_processed'] is True
        assert applied['current_status'] == 'APPROVED'
        assert applied['proposal_id'] == self.test_proposal_id
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_dry_run_behavior(self, mock_supabase_client):
        """Test that proposals are not applied in dry run mode"""
        
        # Mock Supabase client
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock proposal fetch
        mock_proposal_data = {
            'id': self.test_proposal_id,
            'proposal_type': 'PRICE_RANGE_ADJUST',
            'status': 'PENDING',
            'payload': {
                'canonical_item_id': 'canonical_123',
                'new_range': [50.0, 150.0],
                'old_range': [60.0, 120.0]
            }
        }
        
        mock_proposal_response = MagicMock()
        mock_proposal_response.data = [mock_proposal_data]
        
        # Mock feedback insert
        mock_feedback_insert = MagicMock()
        mock_feedback_insert.data = [{'id': 'feedback_456'}]
        
        # Mock proposal update
        mock_proposal_update = MagicMock()
        mock_proposal_update.data = [{'id': self.test_proposal_id}]
        
        # Setup table responses
        def mock_table_response(table_name):
            mock_table = MagicMock()
            
            if table_name == 'human_feedback':
                mock_table.insert.return_value.execute.return_value = mock_feedback_insert
            elif table_name == 'agent_proposals':
                mock_table.select.return_value.eq.return_value.execute.return_value = mock_proposal_response
                mock_table.update.return_value.eq.return_value.execute.return_value = mock_proposal_update
            
            return mock_table
        
        mock_client.table.side_effect = mock_table_response
        
        # Ensure dry_run is True and allow_approve_in_dry_run is False
        feedback_handler.dry_run = True
        feedback_handler.allow_approve_in_dry_run = False
        
        # Create feedback request with proposal approval
        feedback_request = FeedbackRequest(
            invoice_id=self.test_invoice_id,
            line_item_id=self.test_line_item_id,
            decision="ALLOW",
            reason="Dry run test",
            by_user=self.test_user,
            approve_proposal_id=self.test_proposal_id
        )
        
        # Process feedback
        result = feedback_handler.record_feedback(feedback_request)
        
        # Assertions
        assert result['ok'] is True
        assert result['applied'] is not None
        
        applied = result['applied']
        assert applied['approved'] is True
        assert applied['type'] == 'PRICE_RANGE_ADJUST'
        
        application = applied['application']
        assert application['skipped'] is True
        assert application['reason'] == 'dry_run_mode'
        assert application['dry_run'] is True
    
    def test_feedback_request_validation(self):
        """Test input validation for feedback requests"""
        
        # Test missing required fields
        with pytest.raises(ValueError):
            FeedbackRequest(
                invoice_id=self.test_invoice_id,
                # Missing decision and by_user
            )
        
        # Test invalid decision
        with pytest.raises(ValueError):
            FeedbackRequest(
                invoice_id=self.test_invoice_id,
                decision="INVALID_DECISION",
                by_user=self.test_user
            )
        
        # Test valid request
        valid_request = FeedbackRequest(
            invoice_id=self.test_invoice_id,
            line_item_id=self.test_line_item_id,
            decision="ALLOW",
            by_user=self.test_user
        )
        
        assert valid_request.invoice_id == self.test_invoice_id
        assert valid_request.decision.value == "ALLOW"
        assert valid_request.by_user == self.test_user


if __name__ == '__main__':
    pytest.main([__file__, '-v'])