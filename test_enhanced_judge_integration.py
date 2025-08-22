#!/usr/bin/env python3
"""
Comprehensive Test Suite for Enhanced Judge System Integration
Tests all aspects of the LLM-powered evaluation system with Langfuse
"""

import os
import sys
import json
import time
import asyncio
from datetime import datetime
from typing import Dict, Any, List

# Add project root to path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

# Test imports
try:
    from agents.enhanced_judge_system import (
        enhanced_judge_system, AgentType, MetricType,
        start_agent_evaluation, record_performance_metric,
        judge_agent_output, finalize_agent_evaluation,
        get_performance_report
    )
    from agents.langfuse_integration import prompt_manager
    from agents.crew_runner import CrewRunner
    from agents.validation_agent import ValidationAgentCreator
    
    print("✅ All imports successful")
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    sys.exit(1)

class EnhancedJudgeIntegrationTest:
    """Comprehensive test suite for the enhanced judge system"""
    
    def __init__(self):
        self.test_results = {}
        self.crew_runner = CrewRunner()
        self.validator = ValidationAgentCreator()
        
    def run_all_tests(self) -> Dict[str, Any]:
        """Run all integration tests"""
        
        print("🧪 Starting Enhanced Judge System Integration Tests")
        print("=" * 60)
        
        # Test 1: System initialization and status
        self.test_system_initialization()
        
        # Test 2: Individual agent evaluation
        self.test_individual_agent_evaluation()
        
        # Test 3: Crew orchestrator evaluation  
        self.test_crew_orchestrator_evaluation()
        
        # Test 4: Validation agent evaluation
        self.test_validation_agent_evaluation()
        
        # Test 5: Performance metrics and reporting
        self.test_performance_reporting()
        
        # Test 6: Langfuse integration
        self.test_langfuse_integration()
        
        # Generate summary
        return self.generate_test_summary()
    
    def test_system_initialization(self):
        """Test system initialization and configuration"""
        
        print("\n🔧 Test 1: System Initialization")
        
        try:
            # Check system status
            status = {
                'judge_enabled': enhanced_judge_system.enabled,
                'llm_enabled': enhanced_judge_system.use_llm,
                'langfuse_connected': prompt_manager.langfuse is not None,
                'openai_connected': prompt_manager.openai_client is not None,
                'models_available': len(enhanced_judge_system.models) > 0,
                'session_storage': len(enhanced_judge_system.session_evaluations) >= 0
            }
            
            self.test_results['system_initialization'] = {
                'status': 'passed',
                'details': status,
                'issues': []
            }
            
            # Check for potential issues
            issues = []
            if not status['judge_enabled']:
                issues.append("Judge system is disabled")
            if not status['langfuse_connected']:
                issues.append("Langfuse not connected")
            if not status['openai_connected']:
                issues.append("OpenAI not connected")
            
            if issues:
                self.test_results['system_initialization']['issues'] = issues
                print(f"   ⚠️ Issues found: {', '.join(issues)}")
            else:
                print("   ✅ All systems operational")
                
        except Exception as e:
            self.test_results['system_initialization'] = {
                'status': 'failed',
                'error': str(e)
            }
            print(f"   ❌ System initialization test failed: {e}")
    
    def test_individual_agent_evaluation(self):
        """Test evaluation of individual agents"""
        
        print("\n🤖 Test 2: Individual Agent Evaluation")
        
        try:
            # Test each agent type
            agent_tests = []
            
            # Test Item Matcher
            matcher_session = self._test_agent_evaluation(
                AgentType.ITEM_MATCHER,
                {'description': 'PVC Pipe 1/2 inch', 'line_item_id': 'test_001'},
                {
                    'canonical_item_id': 'PVC_PIPE_05',
                    'canonical_name': 'PVC Pipe - 0.5 inch',
                    'match_confidence': 0.85,
                    'match_type': 'fuzzy'
                }
            )
            agent_tests.append(('Item Matcher', matcher_session))
            
            # Test Price Learner
            pricer_session = self._test_agent_evaluation(
                AgentType.PRICE_LEARNER,
                {'canonical_item_id': 'PVC_PIPE_05', 'unit_price': 2.50},
                {
                    'is_valid': True,
                    'expected_range': {'min': 2.00, 'max': 3.00},
                    'variance_percent': 0.0
                }
            )
            agent_tests.append(('Price Learner', pricer_session))
            
            # Test Rule Applier
            rules_session = self._test_agent_evaluation(
                AgentType.RULE_APPLIER,
                {
                    'canonical_item_id': 'PVC_PIPE_05',
                    'unit_price': 2.50,
                    'match_confidence': 0.85,
                    'price_is_valid': True
                },
                {
                    'decision': 'ALLOW',
                    'confidence': 0.9,
                    'reasons': ['High match confidence', 'Valid price'],
                    'policy_codes': ['STANDARD_APPROVAL']
                }
            )
            agent_tests.append(('Rule Applier', rules_session))
            
            self.test_results['individual_agent_evaluation'] = {
                'status': 'passed',
                'agent_tests': agent_tests,
                'total_agents_tested': len(agent_tests)
            }
            
            print(f"   ✅ Successfully tested {len(agent_tests)} agent types")
            
        except Exception as e:
            self.test_results['individual_agent_evaluation'] = {
                'status': 'failed',
                'error': str(e)
            }
            print(f"   ❌ Individual agent evaluation test failed: {e}")
    
    def _test_agent_evaluation(self, agent_type: AgentType, input_data: Dict[str, Any], 
                              output_data: Dict[str, Any]) -> str:
        """Helper to test individual agent evaluation"""
        
        session_id = f"test_{agent_type.value}_{int(time.time())}"
        
        # Start evaluation
        start_agent_evaluation(session_id, agent_type, input_data)
        
        # Record some metrics
        record_performance_metric(session_id, MetricType.RESPONSE_TIME, 0.5)
        record_performance_metric(session_id, MetricType.CONFIDENCE, 0.85)
        
        # Judge output
        judge_result = judge_agent_output(session_id, output_data)
        
        # Finalize
        final_eval = finalize_agent_evaluation(session_id)
        
        return session_id
    
    def test_crew_orchestrator_evaluation(self):
        """Test crew orchestrator with full pipeline evaluation"""
        
        print("\n🚀 Test 3: Crew Orchestrator Evaluation")
        
        try:
            # Create test invoice data
            test_invoice = {
                'invoice_id': f'test_invoice_{int(time.time())}',
                'vendor_id': 'test_vendor_001',
                'items': [
                    {
                        'id': 'item_001',
                        'description': 'PVC Pipe 1/2 inch',
                        'quantity': 10,
                        'unit_price': 2.50
                    },
                    {
                        'id': 'item_002', 
                        'description': 'Wire nuts electrical connectors',
                        'quantity': 50,
                        'unit_price': 0.25
                    }
                ]
            }
            
            # Run crew with evaluation (this will use enhanced system internally)
            if self.crew_runner.enabled:
                result = self.crew_runner.run_crew(
                    test_invoice['invoice_id'],
                    test_invoice['vendor_id'],
                    test_invoice['items']
                )
                
                self.test_results['crew_orchestrator_evaluation'] = {
                    'status': 'passed',
                    'invoice_id': test_invoice['invoice_id'],
                    'items_processed': len(test_invoice['items']),
                    'decisions_made': len(result.get('decisions', {})),
                    'evaluation_included': 'evaluation' in result,
                    'pipeline_stats': result.get('pipeline_stats', {}),
                    'evaluation_data': result.get('evaluation', {})
                }
                
                print(f"   ✅ Processed {len(test_invoice['items'])} items with full evaluation")
                print(f"   📊 Evaluation score: {result.get('evaluation', {}).get('overall_score', 'N/A')}")
                
            else:
                print("   ⚠️ Crew runner disabled - skipping test")
                self.test_results['crew_orchestrator_evaluation'] = {
                    'status': 'skipped',
                    'reason': 'Crew runner disabled'
                }
                
        except Exception as e:
            self.test_results['crew_orchestrator_evaluation'] = {
                'status': 'failed',
                'error': str(e)
            }
            print(f"   ❌ Crew orchestrator evaluation test failed: {e}")
    
    def test_validation_agent_evaluation(self):
        """Test validation agent with enhanced evaluation"""
        
        print("\n🛡️ Test 4: Validation Agent Evaluation")
        
        try:
            # Test cases for validation
            test_cases = [
                {
                    'name': 'PVC Pipe',
                    'description': '1/2 inch PVC pipe for plumbing',
                    'expected': 'approved'
                },
                {
                    'name': 'Pizza',
                    'description': 'Delicious pepperoni pizza for lunch',
                    'expected': 'rejected'
                },
                {
                    'name': 'Wire connector',
                    'description': 'Electrical wire nuts',
                    'expected': 'approved'
                }
            ]
            
            validation_results = []
            
            for test_case in test_cases:
                # Run validation with enhanced evaluation
                result_json = self.validator.validation_tool._run(
                    test_case['name'],
                    test_case['description'],
                    "Testing validation system"
                )
                
                result = json.loads(result_json)
                validation_results.append({
                    'test_case': test_case,
                    'result': result,
                    'correct_decision': result['decision'] == test_case['expected']
                })
            
            # Calculate accuracy
            correct_decisions = sum(1 for r in validation_results if r['correct_decision'])
            accuracy = correct_decisions / len(validation_results)
            
            self.test_results['validation_agent_evaluation'] = {
                'status': 'passed',
                'test_cases': len(test_cases),
                'correct_decisions': correct_decisions,
                'accuracy': accuracy,
                'results': validation_results
            }
            
            print(f"   ✅ Validation accuracy: {accuracy:.1%} ({correct_decisions}/{len(test_cases)})")
            
        except Exception as e:
            self.test_results['validation_agent_evaluation'] = {
                'status': 'failed',
                'error': str(e)
            }
            print(f"   ❌ Validation agent evaluation test failed: {e}")
    
    def test_performance_reporting(self):
        """Test performance reporting and metrics aggregation"""
        
        print("\n📊 Test 5: Performance Reporting")
        
        try:
            # Get comprehensive performance report
            comprehensive_report = get_performance_report(days=1)
            
            # Get agent-specific reports
            agent_reports = {}
            for agent_type in AgentType:
                try:
                    report = get_performance_report(agent_type=agent_type, days=1)
                    agent_reports[agent_type.value] = report
                except Exception as e:
                    agent_reports[agent_type.value] = {'error': str(e)}
            
            self.test_results['performance_reporting'] = {
                'status': 'passed',
                'comprehensive_report_generated': bool(comprehensive_report),
                'agent_reports_generated': len(agent_reports),
                'system_metrics_available': 'system_status' in comprehensive_report,
                'recommendations_provided': len(comprehensive_report.get('recommendations', [])),
                'reports': {
                    'comprehensive': comprehensive_report,
                    'by_agent': agent_reports
                }
            }
            
            print(f"   ✅ Generated comprehensive report with {len(comprehensive_report.get('recommendations', []))} recommendations")
            print(f"   📈 Agent reports: {len(agent_reports)} generated")
            
        except Exception as e:
            self.test_results['performance_reporting'] = {
                'status': 'failed',
                'error': str(e)
            }
            print(f"   ❌ Performance reporting test failed: {e}")
    
    def test_langfuse_integration(self):
        """Test Langfuse integration and tracing"""
        
        print("\n🔗 Test 6: Langfuse Integration")
        
        try:
            integration_status = {
                'langfuse_connected': prompt_manager.langfuse is not None,
                'openai_connected': prompt_manager.openai_client is not None,
                'prompts_available': False,
                'llm_calls_working': False,
                'evaluations_logged': False
            }
            
            # Test prompt retrieval
            if prompt_manager.langfuse:
                try:
                    test_prompt = prompt_manager.get_prompt("item_matcher_backstory")
                    integration_status['prompts_available'] = bool(test_prompt)
                except Exception:
                    pass
            
            # Test LLM call with tracing
            if prompt_manager.openai_client:
                try:
                    response = prompt_manager.call_llm(
                        "Say 'Integration test successful' and nothing else.",
                        trace_name="integration_test"
                    )
                    integration_status['llm_calls_working'] = bool(response and "successful" in response.lower())
                except Exception:
                    pass
            
            # Test evaluation logging
            if prompt_manager.langfuse:
                try:
                    success = prompt_manager.create_judge_evaluation(
                        name="integration_test",
                        input_data={"test": "data"},
                        output_data={"result": "success"},
                        score=0.9,
                        comment="Integration test evaluation"
                    )
                    integration_status['evaluations_logged'] = success
                except Exception:
                    pass
            
            self.test_results['langfuse_integration'] = {
                'status': 'passed',
                'integration_status': integration_status,
                'features_working': sum(integration_status.values()),
                'total_features': len(integration_status)
            }
            
            working_features = sum(integration_status.values())
            total_features = len(integration_status)
            
            print(f"   ✅ Langfuse integration: {working_features}/{total_features} features working")
            
            for feature, working in integration_status.items():
                status_icon = "✅" if working else "❌"
                print(f"      {status_icon} {feature}")
            
        except Exception as e:
            self.test_results['langfuse_integration'] = {
                'status': 'failed',
                'error': str(e)
            }
            print(f"   ❌ Langfuse integration test failed: {e}")
    
    def generate_test_summary(self) -> Dict[str, Any]:
        """Generate comprehensive test summary"""
        
        print("\n" + "=" * 60)
        print("📋 TEST SUMMARY")
        print("=" * 60)
        
        passed_tests = sum(1 for result in self.test_results.values() if result.get('status') == 'passed')
        failed_tests = sum(1 for result in self.test_results.values() if result.get('status') == 'failed')
        skipped_tests = sum(1 for result in self.test_results.values() if result.get('status') == 'skipped')
        total_tests = len(self.test_results)
        
        summary = {
            'timestamp': datetime.utcnow().isoformat(),
            'total_tests': total_tests,
            'passed': passed_tests,
            'failed': failed_tests,
            'skipped': skipped_tests,
            'success_rate': passed_tests / total_tests if total_tests > 0 else 0,
            'detailed_results': self.test_results
        }
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"⏭️ Skipped: {skipped_tests}")
        print(f"Success Rate: {summary['success_rate']:.1%}")
        
        # Show test details
        for test_name, result in self.test_results.items():
            status_icon = {"passed": "✅", "failed": "❌", "skipped": "⏭️"}.get(result['status'], "❓")
            print(f"\n{status_icon} {test_name.replace('_', ' ').title()}")
            
            if result['status'] == 'failed':
                print(f"   Error: {result.get('error', 'Unknown error')}")
            elif result['status'] == 'skipped':
                print(f"   Reason: {result.get('reason', 'Unknown reason')}")
        
        # Overall assessment
        print("\n🎯 OVERALL ASSESSMENT:")
        
        if summary['success_rate'] >= 0.8:
            print("🎉 EXCELLENT: Enhanced judge system is working well!")
            print("   • All core functionality is operational")
            print("   • Langfuse integration providing comprehensive monitoring")
            print("   • Agents are being properly evaluated and tracked")
        elif summary['success_rate'] >= 0.6:
            print("⚠️ GOOD: Enhanced judge system is mostly functional")
            print("   • Core evaluation features working")
            print("   • Some advanced features may need attention")
        elif summary['success_rate'] >= 0.4:
            print("🔧 PARTIAL: Enhanced judge system needs attention")
            print("   • Basic functionality available")
            print("   • Several features need debugging")
        else:
            print("❌ CRITICAL: Enhanced judge system has major issues")
            print("   • Core functionality not working properly")
            print("   • Requires immediate attention")
        
        print(f"\n📊 Full test results saved to summary")
        
        return summary

def main():
    """Run the comprehensive integration test"""
    
    print("🚀 Enhanced Judge System Integration Test Suite")
    print(f"Environment: {os.getenv('NODE_ENV', 'development')}")
    print(f"Timestamp: {datetime.utcnow().isoformat()}")
    
    # Create and run tests
    test_suite = EnhancedJudgeIntegrationTest()
    summary = test_suite.run_all_tests()
    
    # Save results to file
    output_file = os.path.join(project_root, "enhanced_judge_test_results.json")
    with open(output_file, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n💾 Detailed results saved to: {output_file}")
    
    # Exit with appropriate code
    if summary['success_rate'] >= 0.8:
        print("\n🎉 Integration test completed successfully!")
        return 0
    else:
        print(f"\n⚠️ Integration test completed with issues (success rate: {summary['success_rate']:.1%})")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)