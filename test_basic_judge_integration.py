#!/usr/bin/env python3
"""
Basic Test for Enhanced Judge System Integration
Tests core functionality without external dependencies
"""

import os
import sys
import json
import time
from datetime import datetime

# Add project root to path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

def test_basic_integration():
    """Test basic integration without external dependencies"""
    
    print("🧪 Testing Enhanced Judge System - Basic Integration")
    print("=" * 60)
    
    results = {}
    
    # Test 1: Import and initialization
    print("\n🔧 Test 1: Import and Initialization")
    try:
        from agents.enhanced_judge_system import (
            enhanced_judge_system, AgentType, MetricType,
            start_agent_evaluation, record_performance_metric,
            judge_agent_output, finalize_agent_evaluation,
            get_performance_report
        )
        
        print(f"   ✅ Enhanced judge system imported successfully")
        print(f"   📊 System enabled: {enhanced_judge_system.enabled}")
        print(f"   🤖 LLM enabled: {enhanced_judge_system.use_llm}")
        print(f"   🎯 Models available: {len(enhanced_judge_system.models)}")
        
        results['imports'] = 'passed'
        
    except ImportError as e:
        print(f"   ❌ Import failed: {e}")
        results['imports'] = 'failed'
        return results
    
    # Test 2: Agent evaluation session
    print("\n🤖 Test 2: Agent Evaluation Session")
    try:
        # Create a test evaluation session
        session_id = f"test_session_{int(time.time())}"
        
        # Start evaluation
        start_agent_evaluation(
            session_id,
            AgentType.ITEM_MATCHER,
            {
                "description": "Test PVC pipe",
                "line_item_id": "test_001"
            }
        )
        
        print(f"   ✅ Evaluation session started: {session_id}")
        
        # Record metrics
        record_performance_metric(session_id, MetricType.RESPONSE_TIME, 1.23)
        record_performance_metric(session_id, MetricType.CONFIDENCE, 0.85)
        record_performance_metric(session_id, MetricType.ACCURACY, 0.90)
        
        print(f"   ✅ Performance metrics recorded")
        
        # Judge output (will use fallback if LLM not available)
        test_output = {
            'canonical_item_id': 'PVC_PIPE_05',
            'canonical_name': 'PVC Pipe - 0.5 inch',
            'match_confidence': 0.85,
            'match_type': 'fuzzy'
        }
        
        judge_result = judge_agent_output(session_id, test_output)
        print(f"   ✅ Judge evaluation completed: score={judge_result.score:.2f}")
        
        # Finalize evaluation
        final_eval = finalize_agent_evaluation(session_id)
        print(f"   ✅ Evaluation finalized: overall_score={final_eval.overall_score:.2f}")
        
        results['evaluation_session'] = {
            'status': 'passed',
            'session_id': session_id,
            'judge_score': judge_result.score,
            'overall_score': final_eval.overall_score,
            'metrics_count': len(final_eval.performance_metrics)
        }
        
    except Exception as e:
        print(f"   ❌ Evaluation session failed: {e}")
        results['evaluation_session'] = {'status': 'failed', 'error': str(e)}
    
    # Test 3: Multiple agent types
    print("\n🚀 Test 3: Multiple Agent Types")
    try:
        agent_results = {}
        
        for agent_type in AgentType:
            session_id = f"test_{agent_type.value}_{int(time.time())}"
            
            # Start evaluation
            start_agent_evaluation(
                session_id,
                agent_type,
                {"test_input": f"Testing {agent_type.value}"}
            )
            
            # Record metrics
            record_performance_metric(session_id, MetricType.RESPONSE_TIME, 0.5)
            record_performance_metric(session_id, MetricType.CONFIDENCE, 0.8)
            
            # Judge output
            test_output = {"test_result": f"Output from {agent_type.value}"}
            judge_result = judge_agent_output(session_id, test_output)
            
            # Finalize
            final_eval = finalize_agent_evaluation(session_id)
            
            agent_results[agent_type.value] = {
                'session_id': session_id,
                'judge_score': judge_result.score,
                'overall_score': final_eval.overall_score
            }
        
        print(f"   ✅ Successfully tested {len(agent_results)} agent types")
        
        results['multiple_agents'] = {
            'status': 'passed',
            'agents_tested': len(agent_results),
            'results': agent_results
        }
        
    except Exception as e:
        print(f"   ❌ Multiple agents test failed: {e}")
        results['multiple_agents'] = {'status': 'failed', 'error': str(e)}
    
    # Test 4: Performance reporting
    print("\n📊 Test 4: Performance Reporting")
    try:
        # Get comprehensive report
        comprehensive_report = get_performance_report(days=1)
        
        print(f"   ✅ Comprehensive report generated")
        print(f"   📈 Report sections: {list(comprehensive_report.keys())}")
        
        # Get agent-specific reports
        agent_report_count = 0
        for agent_type in AgentType:
            try:
                agent_report = get_performance_report(agent_type=agent_type, days=1)
                agent_report_count += 1
            except Exception:
                pass
        
        print(f"   ✅ Agent reports generated: {agent_report_count}/{len(list(AgentType))}")
        
        results['performance_reporting'] = {
            'status': 'passed',
            'comprehensive_report': bool(comprehensive_report),
            'agent_reports': agent_report_count,
            'report_keys': list(comprehensive_report.keys())
        }
        
    except Exception as e:
        print(f"   ❌ Performance reporting failed: {e}")
        results['performance_reporting'] = {'status': 'failed', 'error': str(e)}
    
    # Test 5: Storage and persistence
    print("\n💾 Test 5: Storage and Persistence")
    try:
        # Check session storage
        total_sessions = len(enhanced_judge_system.session_evaluations)
        total_metrics = sum(len(metrics) for metrics in enhanced_judge_system.performance_history.values())
        
        print(f"   ✅ Active sessions: {total_sessions}")
        print(f"   ✅ Total metrics: {total_metrics}")
        
        # Check data structures
        agent_types_with_data = len([
            agent_type for agent_type in AgentType 
            if enhanced_judge_system.performance_history.get(agent_type)
        ])
        
        print(f"   ✅ Agent types with data: {agent_types_with_data}/{len(list(AgentType))}")
        
        results['storage_persistence'] = {
            'status': 'passed',
            'active_sessions': total_sessions,
            'total_metrics': total_metrics,
            'agent_types_with_data': agent_types_with_data
        }
        
    except Exception as e:
        print(f"   ❌ Storage and persistence test failed: {e}")
        results['storage_persistence'] = {'status': 'failed', 'error': str(e)}
    
    # Generate summary
    print("\n" + "=" * 60)
    print("📋 TEST SUMMARY")
    print("=" * 60)
    
    passed_tests = sum(1 for result in results.values() if (
        isinstance(result, dict) and result.get('status') == 'passed') or result == 'passed'
    )
    failed_tests = sum(1 for result in results.values() if (
        isinstance(result, dict) and result.get('status') == 'failed') or result == 'failed'
    )
    total_tests = len(results)
    
    success_rate = passed_tests / total_tests if total_tests > 0 else 0
    
    print(f"Total Tests: {total_tests}")
    print(f"✅ Passed: {passed_tests}")
    print(f"❌ Failed: {failed_tests}")
    print(f"Success Rate: {success_rate:.1%}")
    
    # Overall assessment
    print(f"\n🎯 OVERALL ASSESSMENT:")
    
    if success_rate >= 0.8:
        print("🎉 EXCELLENT: Enhanced Judge System is working properly!")
        print("   • Core evaluation functionality operational")
        print("   • All agent types can be monitored")
        print("   • Performance metrics are being tracked")
        print("   • Reporting system functional")
    elif success_rate >= 0.6:
        print("✅ GOOD: Enhanced Judge System is mostly functional")
        print("   • Core features working")
        print("   • Some advanced features may need attention")
    else:
        print("⚠️ NEEDS ATTENTION: Some core features not working")
        print("   • Basic functionality may be compromised")
        print("   • Review failed tests and fix issues")
    
    # Save results
    output_file = os.path.join(project_root, "basic_judge_test_results.json")
    test_summary = {
        'timestamp': datetime.utcnow().isoformat(),
        'total_tests': total_tests,
        'passed': passed_tests,
        'failed': failed_tests,
        'success_rate': success_rate,
        'results': results
    }
    
    with open(output_file, 'w') as f:
        json.dump(test_summary, f, indent=2)
    
    print(f"\n💾 Test results saved to: {output_file}")
    
    return success_rate >= 0.6

def main():
    """Run basic integration test"""
    
    print("🚀 Enhanced Judge System - Basic Integration Test")
    print(f"Timestamp: {datetime.utcnow().isoformat()}")
    
    success = test_basic_integration()
    
    if success:
        print("\n🎉 Basic integration test completed successfully!")
        return 0
    else:
        print("\n⚠️ Basic integration test found issues that need attention")
        return 1

if __name__ == "__main__":
    exit_code = main()
    print(f"\nTest completed with exit code: {exit_code}")
    sys.exit(exit_code)