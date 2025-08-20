"""
Smoke tests for cron endpoints - relearn and safety_scan
"""

import json
import pytest
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the endpoints
from api.relearn import app as relearn_app, compute_robust_stats_python
from api.safety_scan import app as safety_scan_app, infer_canonical_name

@pytest.fixture
def relearn_client():
    """Test client for relearn endpoint"""
    relearn_app.config['TESTING'] = True
    return relearn_app.test_client()

@pytest.fixture 
def safety_client():
    """Test client for safety_scan endpoint"""
    safety_scan_app.config['TESTING'] = True
    return safety_scan_app.test_client()

@pytest.fixture
def mock_supabase_tool():
    """Mock SupabaseTool for testing"""
    mock_tool = Mock()
    mock_tool.client = Mock()
    mock_tool.log_event = Mock()
    mock_tool.create_proposal = Mock()
    return mock_tool

class TestRelearnEndpoint:
    """Tests for /api/relearn endpoint"""
    
    @patch('api.relearn.SupabaseTool')
    def test_relearn_success_with_proposals(self, mock_tool_class, relearn_client):
        """Test relearn creates proposals when price changes detected"""
        
        # Setup mock
        mock_tool = Mock()
        mock_tool_class.return_value = mock_tool
        
        # Mock recent invoice data - 15 observations for canonical_001
        mock_tool.client.table.return_value.select.return_value.gte.return_value.not_.is_.return_value.execute.return_value = Mock(
            data=[{'canonical_item_id': 'canonical_001'}] * 15
        )
        
        # Mock current price range (significantly different from new stats)
        mock_tool.client.table.return_value.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{
                'id': 'range_001',
                'min_price': 10.0,
                'max_price': 50.0
            }]
        )
        
        # Mock price data for percentile calculation
        with patch('api.relearn.compute_robust_stats_python') as mock_stats:
            mock_stats.return_value = (15.5, 25.0, 45.2, 15)  # p5, p50, p95, count
            
            response = relearn_client.get('/api/relearn')
            
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert data['ok'] is True
        assert data['scanned'] >= 1
        assert 'proposed' in data
        assert 'skipped' in data
        
        # Verify proposal was created
        mock_tool.create_proposal.assert_called()
        call_args = mock_tool.create_proposal.call_args
        assert call_args[0][0] == 'PRICE_RANGE_ADJUST'
        assert 'canonical_item_id' in call_args[0][1]
        assert 'suggested' in call_args[0][1]
    
    @patch('api.relearn.SupabaseTool')
    def test_relearn_no_data(self, mock_tool_class, relearn_client):
        """Test relearn handles empty data gracefully"""
        
        mock_tool = Mock()
        mock_tool_class.return_value = mock_tool
        
        # No recent data
        mock_tool.client.table.return_value.select.return_value.gte.return_value.not_.is_.return_value.execute.return_value = Mock(data=[])
        
        response = relearn_client.get('/api/relearn')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['ok'] is True
        assert 'No recent invoice data found' in data['message']
    
    def test_compute_robust_stats_python(self):
        """Test Python percentile calculation fallback"""
        
        mock_tool = Mock()
        
        # Mock price data
        price_data = [
            {'unit_price': '10.0'},
            {'unit_price': '15.0'}, 
            {'unit_price': '20.0'},
            {'unit_price': '25.0'},
            {'unit_price': '30.0'},
            {'unit_price': '35.0'},
            {'unit_price': '40.0'},
            {'unit_price': '45.0'},
            {'unit_price': '50.0'},
            {'unit_price': '55.0'}
        ]
        
        mock_tool.client.table.return_value.select.return_value.eq.return_value.gte.return_value.gt.return_value.execute.return_value = Mock(
            data=price_data
        )
        
        result = compute_robust_stats_python(mock_tool, 'canonical_001', '2024-01-01')
        
        assert result is not None
        p5, p50, p95, count = result
        assert count == 10
        assert p5 <= p50 <= p95
        assert p5 >= 10.0  # Should be around 10-15
        assert p95 <= 55.0  # Should be around 50-55

class TestSafetyScanEndpoint:
    """Tests for /api/safety_scan endpoint"""
    
    @patch('api.safety_scan.SupabaseTool')
    def test_safety_scan_finds_band_anomalies(self, mock_tool_class, safety_client):
        """Test safety scan detects min > max anomalies"""
        
        mock_tool = Mock()
        mock_tool_class.return_value = mock_tool
        
        # Mock anomalous band (min > max)
        mock_tool.client.table.return_value.select.return_value.execute.return_value = Mock(
            data=[{
                'id': 'band_001',
                'canonical_item_id': 'canonical_001', 
                'min_price': 50.0,
                'max_price': 30.0  # Invalid: min > max
            }]
        )
        
        # Mock recent price data for fix calculation
        mock_tool.client.table.return_value.select.return_value.eq.return_value.gte.return_value.gt.return_value.execute.return_value = Mock(
            data=[
                {'unit_price': '25.0'},
                {'unit_price': '30.0'},
                {'unit_price': '35.0'},
                {'unit_price': '40.0'},
                {'unit_price': '45.0'}
            ]
        )
        
        # Mock other checks return empty
        def mock_table_select(*args):
            mock_result = Mock()
            mock_result.select.return_value.execute.return_value = Mock(data=[])
            return mock_result
        
        mock_tool.client.table.side_effect = lambda table_name: mock_table_select() if table_name != 'item_price_ranges' else Mock()
        
        response = safety_client.get('/api/safety_scan')
        
        assert response.status_code == 200 
        data = json.loads(response.data)
        
        assert data['ok'] is True
        assert data['issues']['bands_fixed'] >= 1
        
        # Verify proposal was created
        mock_tool.create_proposal.assert_called()
    
    @patch('api.safety_scan.SupabaseTool') 
    def test_safety_scan_finds_missing_bands(self, mock_tool_class, safety_client):
        """Test safety scan detects missing bands for high-usage items"""
        
        mock_tool = Mock()
        mock_tool_class.return_value = mock_tool
        
        # Mock high usage data (25 occurrences)
        usage_data = [{'canonical_item_id': 'canonical_002'}] * 25
        
        # Setup mock call sequence
        def side_effect(*args, **kwargs):
            if hasattr(args[0], 'return_value'):
                # This is a chained call, return appropriate mock
                mock_chain = Mock()
                mock_chain.execute.return_value = Mock(data=usage_data)
                return mock_chain
            return Mock()
        
        mock_tool.client.table.return_value.select.return_value.gte.return_value.not_.is_.return_value.execute.return_value = Mock(data=usage_data)
        
        # Mock no existing band for this canonical
        mock_tool.client.table.return_value.select.return_value.eq.return_value.execute.return_value = Mock(data=[])
        
        # Mock price data for stats
        mock_tool.client.table.return_value.select.return_value.eq.return_value.gte.return_value.gt.return_value.execute.return_value = Mock(
            data=[
                {'unit_price': '20.0'},
                {'unit_price': '25.0'},
                {'unit_price': '30.0'},
                {'unit_price': '35.0'},
                {'unit_price': '40.0'}
            ]
        )
        
        response = safety_client.get('/api/safety_scan')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['ok'] is True
    
    def test_infer_canonical_name(self):
        """Test canonical name inference from synonyms"""
        
        assert infer_canonical_name('desk chair') == 'Desk Chair'
        assert infer_canonical_name('  OFFICE   SUPPLIES  ') == 'Office Supplies'  
        assert infer_canonical_name('wireless mouse') == 'Wireless Mouse'
    
    @patch('api.safety_scan.SupabaseTool')
    def test_safety_scan_empty_data(self, mock_tool_class, safety_client):
        """Test safety scan handles empty database gracefully"""
        
        mock_tool = Mock()
        mock_tool_class.return_value = mock_tool
        
        # All queries return empty
        mock_tool.client.table.return_value.select.return_value.execute.return_value = Mock(data=[])
        
        response = safety_client.get('/api/safety_scan')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['ok'] is True
        assert data['issues']['bands_fixed'] == 0
        assert data['issues']['bands_missing'] == 0

class TestEndpointIntegration:
    """Integration-style tests"""
    
    def test_json_response_structure(self, relearn_client, safety_client):
        """Test both endpoints return proper JSON structure even with errors"""
        
        # Both should handle missing environment gracefully
        with patch('api.relearn.SupabaseTool', side_effect=Exception("Connection failed")):
            response = relearn_client.get('/api/relearn')
            assert response.status_code == 500
            data = json.loads(response.data)
            assert 'ok' in data
            assert data['ok'] is False
            assert 'error' in data
        
        with patch('api.safety_scan.SupabaseTool', side_effect=Exception("Connection failed")):
            response = safety_client.get('/api/safety_scan')
            assert response.status_code == 500
            data = json.loads(response.data)
            assert 'ok' in data
            assert data['ok'] is False
            assert 'error' in data

if __name__ == '__main__':
    # Run a quick smoke test
    print("Running smoke tests for cron endpoints...")
    
    # Test name inference
    assert infer_canonical_name('test item') == 'Test Item'
    print("✓ Name inference works")
    
    # Test percentile calculation with mock data
    mock_tool = Mock()
    mock_tool.client.table.return_value.select.return_value.eq.return_value.gte.return_value.gt.return_value.execute.return_value = Mock(
        data=[{'unit_price': str(i*5)} for i in range(1, 11)]  # 5, 10, 15, ..., 50
    )
    
    result = compute_robust_stats_python(mock_tool, 'test', '2024-01-01')
    if result:
        p5, p50, p95, count = result
        print(f"✓ Stats calculation: p5={p5}, p50={p50}, p95={p95}, n={count}")
        assert p5 <= p50 <= p95
        assert count == 10
    
    print("✓ All smoke tests passed!")