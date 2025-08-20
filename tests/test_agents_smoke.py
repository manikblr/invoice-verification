import pytest
import json
import uuid
from unittest.mock import patch, MagicMock
from agents.crew_runner import CrewRunner


class TestAgentsSmoke:
    """Smoke tests for agent pipeline"""
    
    def setup_method(self):
        """Setup for each test"""
        self.crew_runner = CrewRunner()
        
        # Test data
        self.invoice_id = str(uuid.uuid4())
        self.vendor_id = "TEST_VENDOR_123"
        
        self.test_items = [
            {
                'id': 'item_1',
                'description': 'Office Chair Standard',
                'quantity': 2,
                'unit_price': 150.00
            },
            {
                'id': 'item_2', 
                'description': 'Wireless Mouse Premium',
                'quantity': 5,
                'unit_price': 45.99
            }
        ]
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_crew_runner_basic_flow(self, mock_supabase_client):
        """Test basic crew runner flow with mocked Supabase"""
        
        # Mock Supabase responses
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock canonical items response
        mock_client.table.return_value.select.return_value.execute.return_value.data = [
            {
                'id': 'canonical_1',
                'name': 'Office Chair Standard',
                'category': 'Furniture',
                'description': 'Standard office chair'
            }
        ]
        
        # Mock synonyms response (empty for this test)
        mock_client.table.return_value.select.return_value.execute.return_value.data = []
        
        # Mock price ranges response (empty for this test)  
        mock_client.table.return_value.select.return_value.execute.return_value.data = []
        
        # Mock insert responses for logging
        mock_client.table.return_value.insert.return_value.execute.return_value = None
        
        # Run the crew
        result = self.crew_runner.run_crew(
            self.invoice_id, 
            self.vendor_id, 
            self.test_items
        )
        
        # Assertions
        assert 'invoice_id' in result
        assert 'decisions' in result  
        assert 'pipeline_stats' in result
        assert 'dry_run' in result
        
        assert result['invoice_id'] == self.invoice_id
        assert len(result['decisions']) == 2
        
        # Check decision structure for first item
        item_1_decision = result['decisions']['item_1']
        required_fields = [
            'canonical_item_id', 'canonical_name', 'match_confidence',
            'decision', 'reasons', 'policy_codes', 'proposals'
        ]
        
        for field in required_fields:
            assert field in item_1_decision, f"Missing field: {field}"
        
        # Check decision types
        assert isinstance(item_1_decision['match_confidence'], float)
        assert isinstance(item_1_decision['reasons'], list)
        assert isinstance(item_1_decision['policy_codes'], list)
        assert isinstance(item_1_decision['proposals'], list)
        assert item_1_decision['decision'] in ['ALLOW', 'DENY', 'NEEDS_MORE_INFO']
        
    def test_crew_runner_disabled(self):
        """Test crew runner when agent is disabled"""
        
        # Temporarily disable agent
        with patch.dict('os.environ', {'AGENT_ENABLED': 'false'}):
            crew_runner_disabled = CrewRunner()
            
            result = crew_runner_disabled.run_crew(
                self.invoice_id,
                self.vendor_id, 
                self.test_items
            )
        
        # Assertions
        assert result['pipeline_stats']['agent_enabled'] == False
        assert result['dry_run'] == True
        
        for item_id in ['item_1', 'item_2']:
            decision = result['decisions'][item_id]
            assert decision['decision'] == 'NEEDS_MORE_INFO'
            assert 'Agent pipeline disabled' in decision['reasons']
            assert 'AGENT_DISABLED' in decision['policy_codes']
    
    def test_health_check(self):
        """Test health check functionality"""
        
        with patch('agents.tools.supabase_tool.create_client'):
            health = self.crew_runner.health_check()
            
            # Check required fields
            assert 'enabled' in health
            assert 'dry_run' in health
            assert 'tools_loaded' in health
            assert 'matching_stats' in health
            assert 'pricing_stats' in health
            assert 'rules_stats' in health
            
            # Check types
            assert isinstance(health['enabled'], bool)
            assert isinstance(health['dry_run'], bool)
            assert isinstance(health['tools_loaded'], bool)
    
    def test_line_item_validation(self):
        """Test input validation for line items"""
        
        # Test with invalid item structure
        invalid_items = [
            {
                'id': 'item_1',
                'description': 'Test Item',
                # Missing quantity and unit_price
            }
        ]
        
        with pytest.raises(Exception):  # Should raise some validation error
            # This will fail in the LineItem dataclass creation
            self.crew_runner.run_crew(
                self.invoice_id,
                self.vendor_id,
                invalid_items
            )
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_proposal_creation_dry_run(self, mock_supabase_client):
        """Test that proposals are created in dry run mode"""
        
        # Mock Supabase to return fuzzy match scenario
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock responses for fuzzy matching scenario
        mock_client.table.return_value.select.return_value.execute.return_value.data = [
            {
                'id': 'canonical_1',
                'name': 'Office Chair Premium',  # Different from input "Office Chair Standard"
                'category': 'Furniture'
            }
        ]
        
        # Run crew
        result = self.crew_runner.run_crew(
            self.invoice_id,
            self.vendor_id,
            [self.test_items[0]]  # Just one item
        )
        
        # Should have dry run proposals
        assert result['dry_run'] == True
        
        # Check if proposal was logged (in dry run, proposals are just logged)
        item_decision = result['decisions']['item_1']
        # In dry run mode, proposals list might be populated with dry run proposal IDs
        assert isinstance(item_decision['proposals'], list)
    
    def test_json_serializable_response(self):
        """Test that response is JSON serializable"""
        
        with patch('agents.tools.supabase_tool.create_client'):
            result = self.crew_runner.run_crew(
                self.invoice_id,
                self.vendor_id,
                self.test_items
            )
            
            # Should be able to serialize to JSON
            json_str = json.dumps(result)
            assert isinstance(json_str, str)
            
            # Should be able to deserialize back
            parsed = json.loads(json_str)
            assert parsed == result
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_policy_codes_case_a_allow(self, mock_supabase_client):
        """Case A: ALLOW - exact match, price within band"""
        
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock canonical items (exact match)
        mock_client.table.return_value.select.return_value.execute.return_value.data = [
            {
                'id': 'canonical_chair',
                'name': 'Office Chair Standard',
                'category': 'Furniture'
            }
        ]
        
        # Mock price ranges (within band)
        def mock_table_response(table_name):
            if table_name == 'item_price_ranges':
                mock_table = MagicMock()
                mock_table.select.return_value.execute.return_value.data = [
                    {
                        'canonical_item_id': 'canonical_chair',
                        'min_price': 100.0,
                        'max_price': 200.0
                    }
                ]
                return mock_table
            else:
                mock_table = MagicMock()
                mock_table.select.return_value.execute.return_value.data = []
                return mock_table
        
        mock_client.table.side_effect = mock_table_response
        
        # Test item with price within band
        test_item = {
            'id': 'item_1',
            'description': 'Office Chair Standard',  # Exact match
            'quantity': 2,
            'unit_price': 150.0  # Within range 100-200
        }
        
        result = self.crew_runner.run_crew(
            self.invoice_id,
            self.vendor_id,
            [test_item]
        )
        
        decision = result['decisions']['item_1']
        
        # Should be ALLOW with empty policy codes (no blocking rules)
        assert decision['decision'] == 'ALLOW'
        assert isinstance(decision['policy_codes'], list)
        assert isinstance(decision['reasons'], list)
        # For ALLOW case, policy_codes should be empty (no violations)
        assert decision['policy_codes'] == []
        assert decision['reasons'] == []
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_policy_codes_case_b_deny_price_high(self, mock_supabase_client):
        """Case B: DENY - price > 1.5× max"""
        
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock canonical items
        mock_client.table.return_value.select.return_value.execute.return_value.data = [
            {
                'id': 'canonical_chair',
                'name': 'Office Chair Standard',
                'category': 'Furniture'
            }
        ]
        
        # Mock price ranges
        def mock_table_response(table_name):
            if table_name == 'item_price_ranges':
                mock_table = MagicMock()
                mock_table.select.return_value.execute.return_value.data = [
                    {
                        'canonical_item_id': 'canonical_chair',
                        'min_price': 100.0,
                        'max_price': 200.0  # 1.5× = 300, so 450 > 300
                    }
                ]
                return mock_table
            else:
                mock_table = MagicMock()
                mock_table.select.return_value.execute.return_value.data = []
                return mock_table
        
        mock_client.table.side_effect = mock_table_response
        
        # Test item with price exceeding 1.5× max
        test_item = {
            'id': 'item_1',
            'description': 'Office Chair Standard',
            'quantity': 1,
            'unit_price': 450.0  # > 1.5 × 200 = 300
        }
        
        result = self.crew_runner.run_crew(
            self.invoice_id,
            self.vendor_id,
            [test_item]
        )
        
        decision = result['decisions']['item_1']
        
        # Should be DENY with PRICE_EXCEEDS_MAX_150 policy code
        assert decision['decision'] == 'DENY'
        assert 'PRICE_EXCEEDS_MAX_150' in decision['policy_codes']
        assert len(decision['reasons']) > 0
        assert any('exceeds allowed max' in reason for reason in decision['reasons'])
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_policy_codes_case_c_needs_info_no_band(self, mock_supabase_client):
        """Case C: NEEDS_MORE_INFO - no price band present"""
        
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock canonical items (match found)
        mock_client.table.return_value.select.return_value.execute.return_value.data = [
            {
                'id': 'canonical_widget',
                'name': 'Mystery Widget',
                'category': 'Unknown'
            }
        ]
        
        # Mock empty price ranges (no band for this item)
        def mock_table_response(table_name):
            if table_name == 'item_price_ranges':
                mock_table = MagicMock()
                mock_table.select.return_value.execute.return_value.data = []  # No price bands
                return mock_table
            else:
                mock_table = MagicMock()
                mock_table.select.return_value.execute.return_value.data = []
                return mock_table
        
        mock_client.table.side_effect = mock_table_response
        
        # Test item with no price band
        test_item = {
            'id': 'item_1',
            'description': 'Mystery Widget',
            'quantity': 1,
            'unit_price': 100.0
        }
        
        result = self.crew_runner.run_crew(
            self.invoice_id,
            self.vendor_id,
            [test_item]
        )
        
        decision = result['decisions']['item_1']
        
        # Should be NEEDS_MORE_INFO with NO_PRICE_BAND policy code
        assert decision['decision'] == 'NEEDS_MORE_INFO'
        assert 'NO_PRICE_BAND' in decision['policy_codes']
        assert len(decision['reasons']) > 0
        assert any('price range data' in reason for reason in decision['reasons'])
    
    def test_all_decisions_have_policy_codes_and_reasons(self):
        """Test that every decision has policy_codes and reasons arrays"""
        
        with patch('agents.tools.supabase_tool.create_client'):
            result = self.crew_runner.run_crew(
                self.invoice_id,
                self.vendor_id,
                self.test_items
            )
            
            # Every decision should have these fields
            for item_id, decision in result['decisions'].items():
                assert 'policy_codes' in decision, f"Missing policy_codes for {item_id}"
                assert 'reasons' in decision, f"Missing reasons for {item_id}"
                assert isinstance(decision['policy_codes'], list), f"policy_codes not list for {item_id}"
                assert isinstance(decision['reasons'], list), f"reasons not list for {item_id}"


if __name__ == '__main__':
    # Run the tests
    pytest.main([__file__, '-v'])