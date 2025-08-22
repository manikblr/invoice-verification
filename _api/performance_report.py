#!/usr/bin/env python3
"""
Performance Report API for Agent Evaluation System
Provides comprehensive performance metrics and evaluation data via Langfuse
"""

import sys
import os
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

try:
    from agents.enhanced_judge_system import (
        enhanced_judge_system, get_performance_report, AgentType
    )
    from agents.langfuse_integration import prompt_manager
except ImportError as e:
    print(f"Import error: {e}")
    enhanced_judge_system = None
    get_performance_report = None
    AgentType = None
    prompt_manager = None

def handle_performance_report(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle performance report requests"""
    
    # CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    }
    
    try:
        # Handle OPTIONS request
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'CORS preflight'})
            }
        
        # Check if enhanced judge system is available
        if not enhanced_judge_system:
            return {
                'statusCode': 503,
                'headers': headers,
                'body': json.dumps({
                    'error': 'Enhanced judge system not available',
                    'message': 'Agent evaluation system not properly initialized'
                })
            }
        
        # Parse query parameters
        query_params = event.get('queryStringParameters') or {}
        
        # Get agent type filter
        agent_type_param = query_params.get('agent_type')
        agent_type = None
        if agent_type_param and AgentType:
            try:
                agent_type = AgentType(agent_type_param)
            except ValueError:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({
                        'error': 'Invalid agent type',
                        'valid_types': [t.value for t in AgentType]
                    })
                }
        
        # Get time period
        days = int(query_params.get('days', '7'))
        if days <= 0 or days > 365:
            days = 7
        
        # Get report type
        report_type = query_params.get('type', 'summary')
        
        if report_type == 'comprehensive':
            # Get comprehensive system report
            report = get_performance_report(days=days)
            
        elif report_type == 'agent' and agent_type:
            # Get specific agent report
            report = get_performance_report(agent_type=agent_type, days=days)
            
        else:
            # Get summary report (default)
            report = get_performance_report(days=days)
            
            # Add system status
            report['system_status'] = {
                'judge_enabled': enhanced_judge_system.enabled,
                'llm_enabled': enhanced_judge_system.use_llm,
                'langfuse_connected': prompt_manager.langfuse is not None if prompt_manager else False,
                'models_available': enhanced_judge_system.models,
                'evaluation_sessions': len(enhanced_judge_system.session_evaluations)
            }
        
        # Add metadata
        report['metadata'] = {
            'generated_at': datetime.utcnow().isoformat(),
            'period_days': days,
            'report_type': report_type,
            'agent_filter': agent_type.value if agent_type else None,
            'api_version': '1.0'
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(report, indent=2)
        }
        
    except Exception as e:
        print(f"Error generating performance report: {e}")
        
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            })
        }

def handle_evaluation_details(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle evaluation details requests"""
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    }
    
    try:
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'CORS preflight'})
            }
        
        if not enhanced_judge_system:
            return {
                'statusCode': 503,
                'headers': headers,
                'body': json.dumps({'error': 'Enhanced judge system not available'})
            }
        
        # Get session ID from path parameters
        path_params = event.get('pathParameters') or {}
        session_id = path_params.get('sessionId')
        
        if not session_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Session ID required'})
            }
        
        # Get evaluation details
        evaluation = enhanced_judge_system.session_evaluations.get(session_id)
        
        if not evaluation:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'error': 'Evaluation session not found'})
            }
        
        # Convert to serializable format
        result = {
            'session_id': evaluation.session_id,
            'agent_type': evaluation.agent_type.value,
            'input_data': evaluation.input_data,
            'output_data': evaluation.output_data,
            'overall_score': evaluation.overall_score,
            'confidence': evaluation.confidence,
            'timestamp': evaluation.timestamp.isoformat(),
            'langfuse_trace_id': evaluation.langfuse_trace_id,
            'recommendations': evaluation.recommendations,
            'performance_metrics': [
                {
                    'metric_type': metric.metric_type.value,
                    'value': metric.value,
                    'timestamp': metric.timestamp.isoformat(),
                    'context': metric.context
                } for metric in evaluation.performance_metrics
            ],
            'judge_results': [
                {
                    'score': result.score,
                    'confidence': result.confidence,
                    'reasoning': result.reasoning,
                    'recommendations': result.recommendations,
                    'judgement_type': result.judgement_type.value,
                    'metadata': result.metadata
                } for result in evaluation.judge_results
            ]
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(result, indent=2)
        }
        
    except Exception as e:
        print(f"Error retrieving evaluation details: {e}")
        
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }

def handle_metrics_history(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle metrics history requests"""
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    }
    
    try:
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'CORS preflight'})
            }
        
        if not enhanced_judge_system:
            return {
                'statusCode': 503,
                'headers': headers,
                'body': json.dumps({'error': 'Enhanced judge system not available'})
            }
        
        query_params = event.get('queryStringParameters') or {}
        
        # Get agent type
        agent_type_param = query_params.get('agent_type')
        if not agent_type_param:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Agent type required'})
            }
        
        try:
            agent_type = AgentType(agent_type_param)
        except ValueError:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': 'Invalid agent type',
                    'valid_types': [t.value for t in AgentType]
                })
            }
        
        # Get time period
        days = int(query_params.get('days', '7'))
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Get metrics for the agent
        metrics_history = enhanced_judge_system.performance_history.get(agent_type, [])
        recent_metrics = [m for m in metrics_history if m.timestamp >= cutoff_date]
        
        # Group by metric type and prepare time series data
        metrics_data = {}
        for metric in recent_metrics:
            metric_type = metric.metric_type.value
            if metric_type not in metrics_data:
                metrics_data[metric_type] = []
            
            metrics_data[metric_type].append({
                'timestamp': metric.timestamp.isoformat(),
                'value': metric.value,
                'context': metric.context,
                'evaluation_id': metric.evaluation_id
            })
        
        # Sort by timestamp
        for metric_type in metrics_data:
            metrics_data[metric_type].sort(key=lambda x: x['timestamp'])
        
        result = {
            'agent_type': agent_type.value,
            'period_days': days,
            'total_metrics': len(recent_metrics),
            'metrics_by_type': metrics_data,
            'generated_at': datetime.utcnow().isoformat()
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(result, indent=2)
        }
        
    except Exception as e:
        print(f"Error retrieving metrics history: {e}")
        
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }

# Main handler for Vercel
def handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """Main handler for performance report API"""
    
    path = event.get('path', event.get('rawPath', ''))
    
    if '/evaluation/' in path:
        return handle_evaluation_details(event)
    elif '/metrics/history' in path:
        return handle_metrics_history(event)
    else:
        return handle_performance_report(event)

# For local testing
if __name__ == "__main__":
    # Test the API locally
    test_event = {
        'httpMethod': 'GET',
        'queryStringParameters': {
            'days': '7',
            'type': 'comprehensive'
        }
    }
    
    response = handler(test_event)
    print(f"Status: {response['statusCode']}")
    
    if response['statusCode'] == 200:
        data = json.loads(response['body'])
        print(f"Report generated with {len(data.get('agent_summaries', {}))} agent summaries")
        print(f"System status: {data.get('system_status', {})}")
    else:
        print(f"Error: {response['body']}")