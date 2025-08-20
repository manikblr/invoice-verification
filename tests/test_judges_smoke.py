import pytest
import uuid
from unittest.mock import patch, MagicMock
from agents.judges import stable_fingerprint, DeterministicJudge, ExplanationJudge, JudgeRunner, GoldLabel


class TestJudgesSmoke:
    """Smoke tests for judge agents"""
    
    def setup_method(self):
        """Setup for each test"""
        self.test_description = "Office Chair Standard"
        self.test_vendor_id = "VENDOR_123"
        self.test_fingerprint = stable_fingerprint(self.test_description, self.test_vendor_id)
        
        # Sample decision data
        self.decision_data = {
            'decision': 'ALLOW',
            'policy_codes': [],
            'canonical_item_id': 'canonical_chair_001',
            'reasons': ['High confidence match with valid price']
        }
    
    def test_stable_fingerprint(self):
        """Test fingerprint generation is stable and normalized"""
        
        # Same inputs should produce same fingerprint
        fp1 = stable_fingerprint("Office Chair", "VENDOR_123")
        fp2 = stable_fingerprint("Office Chair", "VENDOR_123")
        assert fp1 == fp2
        
        # Different inputs should produce different fingerprints
        fp3 = stable_fingerprint("Desk Lamp", "VENDOR_123")
        assert fp1 != fp3
        
        # Normalization should work
        fp4 = stable_fingerprint("  Office   Chair  ", "VENDOR_123")
        fp5 = stable_fingerprint("office chair", "VENDOR_123")
        assert fp4 == fp5
        
        # Different vendors should produce different fingerprints
        fp6 = stable_fingerprint("Office Chair", "VENDOR_456")
        assert fp1 != fp6
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_judge_with_gold_label_matching(self, mock_supabase_client):
        """Test decision_correct is 1 when matching gold label, 0 when not"""
        
        # Mock Supabase client
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock gold label response
        mock_response = MagicMock()
        mock_response.data = [{
            'expected_decision': 'ALLOW',
            'expected_canonical_id': 'canonical_chair_001',
            'expected_policy_codes': [],
            'note': 'Test gold label'
        }]
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response
        
        from agents.tools.supabase_tool import SupabaseTool
        supabase_tool = SupabaseTool()
        judge = DeterministicJudge(supabase_tool)
        
        # Test matching decision
        score = judge.score_decision('ALLOW', self.test_fingerprint)
        assert score == 1.0
        
        # Test non-matching decision
        score = judge.score_decision('DENY', self.test_fingerprint)
        assert score == 0.0
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_judge_without_gold_label(self, mock_supabase_client):
        """Test scores are None when no gold label exists except price_check_correct"""
        
        # Mock Supabase client with empty response
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        mock_response = MagicMock()
        mock_response.data = []  # No gold label
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response
        
        from agents.tools.supabase_tool import SupabaseTool
        supabase_tool = SupabaseTool()
        judge = DeterministicJudge(supabase_tool)
        
        # All gold-dependent scores should be None
        assert judge.score_decision('ALLOW', self.test_fingerprint) is None
        assert judge.score_policy([], self.test_fingerprint) is None
        assert judge.score_match('canonical_chair_001', self.test_fingerprint) is None
        
        # Price check can work without gold if price band is present
        price_band = {'min_price': 100.0, 'max_price': 200.0}
        score = judge.score_price_check(150.0, price_band, 'ALLOW', [])
        assert score == 1.0  # Price within range, no violations expected
        
        # Price check returns None if no price band
        assert judge.score_price_check(150.0, None, 'ALLOW', []) is None
    
    def test_price_check_scoring(self):
        """Test price_check_correct scoring logic"""
        
        from agents.tools.supabase_tool import SupabaseTool
        with patch('agents.tools.supabase_tool.create_client'):
            supabase_tool = SupabaseTool()
            judge = DeterministicJudge(supabase_tool)
        
        price_band = {'min_price': 100.0, 'max_price': 200.0}
        
        # Price within range - should be 1.0
        score = judge.score_price_check(150.0, price_band, 'ALLOW', [])
        assert score == 1.0
        
        # Price exceeds 1.5x max (300) - should expect DENY and PRICE_EXCEEDS_MAX_150
        score = judge.score_price_check(350.0, price_band, 'DENY', ['PRICE_EXCEEDS_MAX_150'])
        assert score == 1.0
        
        # Price exceeds but wrong decision
        score = judge.score_price_check(350.0, price_band, 'ALLOW', ['PRICE_EXCEEDS_MAX_150'])
        assert score == 0.0
        
        # Price exceeds but missing policy code
        score = judge.score_price_check(350.0, price_band, 'DENY', [])
        assert score == 0.0
        
        # Price below 0.5x min (50) - should expect DENY and PRICE_BELOW_MIN_50
        score = judge.score_price_check(40.0, price_band, 'DENY', ['PRICE_BELOW_MIN_50'])
        assert score == 1.0
        
        # No price band
        assert judge.score_price_check(150.0, None, 'ALLOW', []) is None
    
    def test_verdict_logic(self):
        """Test verdict determination from scores"""
        
        from agents.tools.supabase_tool import SupabaseTool
        with patch('agents.tools.supabase_tool.create_client'):
            supabase_tool = SupabaseTool()
            judge = DeterministicJudge(supabase_tool)
        
        # All high scores - PASS
        scores = {'decision_correct': 1.0, 'policy_justified': 0.9, 'match_correct': 1.0}
        assert judge.verdict(scores) == 'PASS'
        
        # One score below 0.8 - WARN
        scores = {'decision_correct': 1.0, 'policy_justified': 0.7, 'match_correct': 1.0}
        assert judge.verdict(scores) == 'WARN'
        
        # One score below 0.6 - FAIL
        scores = {'decision_correct': 1.0, 'policy_justified': 0.5, 'match_correct': 1.0}
        assert judge.verdict(scores) == 'FAIL'
        
        # No scores present - PASS
        scores = {'decision_correct': None, 'policy_justified': None}
        assert judge.verdict(scores) == 'PASS'
        
        # Mixed None and low scores
        scores = {'decision_correct': None, 'policy_justified': 0.5, 'match_correct': None}
        assert judge.verdict(scores) == 'FAIL'
    
    def test_policy_scoring_jaccard(self):
        """Test policy code scoring using Jaccard similarity"""
        
        # Mock gold label with policy codes
        gold = GoldLabel(
            expected_decision='DENY',
            expected_canonical_id='canonical_123',
            expected_policy_codes=['PRICE_EXCEEDS_MAX_150', 'NO_PRICE_BAND'],
            note='Test'
        )
        
        from agents.tools.supabase_tool import SupabaseTool
        with patch('agents.tools.supabase_tool.create_client'):
            supabase_tool = SupabaseTool()
            judge = DeterministicJudge(supabase_tool)
            judge._gold_cache['test_fp'] = gold
        
        # Perfect match
        score = judge.score_policy(['PRICE_EXCEEDS_MAX_150', 'NO_PRICE_BAND'], 'test_fp')
        assert score == 1.0
        
        # Partial match (1 out of 2)
        score = judge.score_policy(['PRICE_EXCEEDS_MAX_150'], 'test_fp')
        # Jaccard: intersection(1) / union(2) = 0.5
        assert score == 0.5
        
        # No match
        score = judge.score_policy(['OTHER_CODE'], 'test_fp')
        # Jaccard: intersection(0) / union(3) = 0
        assert score == 0.0
        
        # Empty sets
        judge._gold_cache['empty_fp'] = GoldLabel('ALLOW', None, [], None)
        score = judge.score_policy([], 'empty_fp')
        assert score == 1.0
    
    def test_explanation_heuristic_scoring(self):
        """Test explanation quality scoring with heuristics"""
        
        from agents.tools.supabase_tool import SupabaseTool
        with patch('agents.tools.supabase_tool.create_client'):
            supabase_tool = SupabaseTool()
            exp_judge = ExplanationJudge(supabase_tool)
        
        # Good explanation: right length, references policy, has numeric, has structure
        good_text = "Price 350.0 exceeds maximum allowed threshold of 300.0 per PRICE_EXCEEDS_MAX_150 policy."
        score = exp_judge.score_explanation(good_text, ['PRICE_EXCEEDS_MAX_150'])
        assert score >= 0.8  # Should get most points
        
        # Poor explanation: too short, no policy reference
        poor_text = "Bad price"
        score = exp_judge.score_explanation(poor_text, ['PRICE_EXCEEDS_MAX_150'])
        assert score <= 0.4
        
        # Empty explanation
        score = exp_judge.score_explanation("", [])
        assert score == 0.0
        
        # Medium explanation: good length but missing other criteria
        medium_text = "The item price seems too high for this type of product category."
        score = exp_judge.score_explanation(medium_text, [])
        assert 0.2 <= score <= 0.6
    
    @patch('agents.tools.supabase_tool.create_client')
    def test_judge_runner_integration(self, mock_supabase_client):
        """Test full judge runner integration"""
        
        # Mock Supabase client
        mock_client = MagicMock()
        mock_supabase_client.return_value = mock_client
        
        # Mock no gold label
        mock_response = MagicMock()
        mock_response.data = []
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response
        
        # Mock insert response
        mock_insert = MagicMock()
        mock_client.table.return_value.insert.return_value.execute.return_value = mock_insert
        
        # Test with judge enabled
        with patch.dict('os.environ', {'JUDGE_ENABLED': 'true'}):
            judge_runner = JudgeRunner()
            
            result = judge_runner.judge_line_item(
                decision_data=self.decision_data,
                description=self.test_description,
                vendor_id=self.test_vendor_id,
                unit_price=150.0,
                price_band={'min_price': 100.0, 'max_price': 200.0},
                invoice_id='test_invoice',
                line_item_id='test_item'
            )
            
            # Should return judgement
            assert result is not None
            assert 'scores' in result
            assert 'verdict' in result
            
            # Should have called insert
            mock_client.table.assert_called_with('agent_judgements')
        
        # Test with judge disabled
        with patch.dict('os.environ', {'JUDGE_ENABLED': 'false'}):
            judge_runner = JudgeRunner()
            
            result = judge_runner.judge_line_item(
                decision_data=self.decision_data,
                description=self.test_description,
                vendor_id=self.test_vendor_id,
                unit_price=150.0,
                price_band=None,
                invoice_id='test_invoice',
                line_item_id='test_item'
            )
            
            # Should return None when disabled
            assert result is None


if __name__ == '__main__':
    pytest.main([__file__, '-v'])