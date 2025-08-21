import os
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from flask import Flask, request, jsonify
from pydantic import BaseModel, ValidationError, Field
from enum import Enum
from agents.tools.supabase_tool import SupabaseTool

app = Flask(__name__)

class FeedbackDecision(str, Enum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    NEEDS_MORE_INFO = "NEEDS_MORE_INFO"

class FeedbackRequest(BaseModel):
    invoice_id: str
    line_item_id: Optional[str] = None
    decision: FeedbackDecision
    reason: Optional[str] = None
    by_user: str
    approve_proposal_id: Optional[str] = None

class FeedbackHandler:
    def __init__(self):
        self.supabase = SupabaseTool()
        self.dry_run = os.getenv('AGENT_DRY_RUN', 'true').lower() == 'true'
        self.allow_approve_in_dry_run = os.getenv('ALLOW_APPROVE_IN_DRY_RUN', 'false').lower() == 'true'
    
    def record_feedback(self, feedback: FeedbackRequest) -> Dict[str, Any]:
        """Record human feedback and optionally approve proposals"""
        
        # Generate feedback ID
        feedback_id = str(uuid.uuid4())
        
        try:
            # 1. Insert feedback record
            feedback_data = {
                'id': feedback_id,
                'invoice_id': feedback.invoice_id,
                'line_item_id': feedback.line_item_id,
                'decision': feedback.decision.value,
                'reason': feedback.reason,
                'by_user': feedback.by_user,
                'related_proposal_id': feedback.approve_proposal_id,
                'created_at': datetime.utcnow().isoformat()
            }
            
            # Insert feedback (always record, even in dry-run)
            self.supabase.client.table('human_feedback').insert(feedback_data).execute()
            
            # Log feedback creation (privacy-safe)
            self.supabase.log_event(feedback.invoice_id, feedback.line_item_id, 'FEEDBACK_RECORDED', {
                'feedback_id': feedback_id,
                'decision': feedback.decision.value,
                'has_reason': feedback.reason is not None,
                'by_user_length': len(feedback.by_user),
                'has_proposal': feedback.approve_proposal_id is not None
            })
            
            result = {
                'ok': True,
                'feedback_id': feedback_id,
                'applied': None
            }
            
            # 2. Handle proposal approval if requested
            if feedback.approve_proposal_id:
                applied_result = self._handle_proposal_approval(
                    feedback.approve_proposal_id,
                    feedback.by_user
                )
                result['applied'] = applied_result
            
            return result
            
        except Exception as e:
            # Log error without exposing internals
            self.supabase.log_event(None, None, 'FEEDBACK_ERROR', {
                'error_type': type(e).__name__,
                'has_proposal_approval': feedback.approve_proposal_id is not None
            })
            raise
    
    def _handle_proposal_approval(self, proposal_id: str, approved_by: str) -> Dict[str, Any]:
        """Handle approval and application of a proposal"""
        
        try:
            # Fetch the proposal
            response = self.supabase.client.table('agent_proposals')\
                .select('*')\
                .eq('id', proposal_id)\
                .execute()
            
            if not response.data:
                return {'error': 'Proposal not found', 'proposal_id': proposal_id}
            
            proposal = response.data[0]
            
            # Check if already processed
            if proposal['status'] != 'PENDING':
                return {
                    'already_processed': True,
                    'current_status': proposal['status'],
                    'proposal_id': proposal_id
                }
            
            # Mark proposal as approved
            update_data = {
                'status': 'APPROVED',
                'approved_by': approved_by,
                'approved_at': datetime.utcnow().isoformat()
            }
            
            self.supabase.client.table('agent_proposals')\
                .update(update_data)\
                .eq('id', proposal_id)\
                .execute()
            
            # Apply the change if conditions are met
            should_apply = (not self.dry_run) or self.allow_approve_in_dry_run
            
            if should_apply:
                application_result = self._apply_proposal(proposal)
            else:
                application_result = {
                    'skipped': True,
                    'reason': 'dry_run_mode',
                    'dry_run': self.dry_run,
                    'allow_approve_in_dry_run': self.allow_approve_in_dry_run
                }
            
            # Log approval
            self.supabase.log_event(None, None, 'PROPOSAL_APPROVED', {
                'proposal_id': proposal_id,
                'proposal_type': proposal['proposal_type'],
                'approved_by_length': len(approved_by),
                'applied': should_apply
            })
            
            return {
                'approved': True,
                'proposal_id': proposal_id,
                'type': proposal['proposal_type'],
                'application': application_result
            }
            
        except Exception as e:
            self.supabase.log_event(None, None, 'PROPOSAL_APPROVAL_ERROR', {
                'error_type': type(e).__name__,
                'proposal_id': proposal_id
            })
            return {
                'error': f'Failed to approve proposal: {type(e).__name__}',
                'proposal_id': proposal_id
            }
    
    def _apply_proposal(self, proposal: Dict[str, Any]) -> Dict[str, Any]:
        """Apply an approved proposal to the database"""
        
        proposal_type = proposal['proposal_type']
        payload = proposal['payload']
        
        try:
            if proposal_type == 'NEW_SYNONYM':
                return self._apply_new_synonym(payload)
            
            elif proposal_type == 'PRICE_RANGE_ADJUST':
                return self._apply_price_range_adjust(payload)
            
            elif proposal_type == 'NEW_RULE':
                return self._apply_new_rule(payload)
            
            elif proposal_type == 'NEW_CANONICAL':
                return self._apply_new_canonical(payload)
            
            else:
                return {
                    'error': f'Unsupported proposal type: {proposal_type}',
                    'type': proposal_type
                }
                
        except Exception as e:
            return {
                'error': f'Failed to apply {proposal_type}: {str(e)}',
                'type': proposal_type
            }
    
    def _apply_new_synonym(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Apply NEW_SYNONYM proposal"""
        
        canonical_item_id = payload['canonical_item_id']
        synonym = payload['synonym']
        confidence = payload.get('confidence', 1.0)
        
        # Check if synonym already exists (idempotent)
        existing = self.supabase.client.table('synonyms')\
            .select('id')\
            .eq('canonical_item_id', canonical_item_id)\
            .eq('synonym', synonym)\
            .execute()
        
        if existing.data:
            return {
                'type': 'NEW_SYNONYM',
                'already_exists': True,
                'synonym_id': existing.data[0]['id']
            }
        
        # Insert new synonym
        synonym_data = {
            'canonical_item_id': canonical_item_id,
            'synonym': synonym,
            'confidence': confidence,
            'created_at': datetime.utcnow().isoformat()
        }
        
        result = self.supabase.client.table('synonyms').insert(synonym_data).execute()
        
        return {
            'type': 'NEW_SYNONYM',
            'created': True,
            'synonym_id': result.data[0]['id'] if result.data else None,
            'synonym': synonym
        }
    
    def _apply_price_range_adjust(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Apply PRICE_RANGE_ADJUST proposal"""
        
        canonical_item_id = payload['canonical_item_id']
        new_range = payload['new_range']
        
        # Upsert price range
        price_data = {
            'canonical_item_id': canonical_item_id,
            'min_price': new_range[0],
            'max_price': new_range[1],
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Try update first
        update_result = self.supabase.client.table('item_price_ranges')\
            .update(price_data)\
            .eq('canonical_item_id', canonical_item_id)\
            .execute()
        
        if not update_result.data:
            # Insert if no existing record
            insert_result = self.supabase.client.table('item_price_ranges')\
                .insert(price_data)\
                .execute()
            created = True
        else:
            created = False
        
        return {
            'type': 'PRICE_RANGE_ADJUST',
            'created': created,
            'updated': not created,
            'canonical_item_id': canonical_item_id,
            'new_range': new_range
        }
    
    def _apply_new_rule(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Apply NEW_RULE proposal"""
        
        # Basic validation
        required_fields = ['rule_type', 'conditions', 'actions']
        for field in required_fields:
            if field not in payload:
                raise ValueError(f'Missing required field: {field}')
        
        rule_data = {
            'rule_type': payload['rule_type'],
            'conditions': payload['conditions'],
            'actions': payload['actions'],
            'description': payload.get('description', ''),
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Note: Using generic 'item_rules' table name - adjust based on actual schema
        result = self.supabase.client.table('business_rules').insert(rule_data).execute()
        
        return {
            'type': 'NEW_RULE',
            'created': True,
            'rule_id': result.data[0]['id'] if result.data else None,
            'rule_type': payload['rule_type']
        }
    
    def _apply_new_canonical(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Apply NEW_CANONICAL proposal"""
        
        canonical_data = {
            'name': payload['name'],
            'category': payload.get('category', ''),
            'description': payload.get('description', ''),
            'created_at': datetime.utcnow().isoformat()
        }
        
        result = self.supabase.client.table('canonical_items').insert(canonical_data).execute()
        
        return {
            'type': 'NEW_CANONICAL',
            'created': True,
            'canonical_item_id': result.data[0]['id'] if result.data else None,
            'name': payload['name']
        }

# Global feedback handler
feedback_handler = FeedbackHandler()

@app.route('/api/feedback', methods=['POST'])
def record_feedback():
    """
    POST /api/feedback
    Record human feedback and optionally approve proposals
    """
    
    try:
        # Validate request
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        request_data = request.get_json()
        
        # Validate with Pydantic
        try:
            feedback_request = FeedbackRequest(**request_data)
        except ValidationError as e:
            return jsonify({
                'error': 'Invalid request format',
                'details': e.errors()
            }), 400
        
        # Process feedback
        result = feedback_handler.record_feedback(feedback_request)
        
        return jsonify(result), 200
        
    except Exception as e:
        # Log error without exposing internals
        feedback_handler.supabase.log_event(None, None, 'FEEDBACK_API_ERROR', {
            'error_type': type(e).__name__
        })
        
        return jsonify({
            'error': 'Internal server error',
            'ok': False
        }), 500

@app.route('/api/feedback/health', methods=['GET'])
def feedback_health():
    """Health check for feedback API"""
    try:
        return jsonify({
            'status': 'healthy',
            'dry_run': feedback_handler.dry_run,
            'allow_approve_in_dry_run': feedback_handler.allow_approve_in_dry_run
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5002))
    app.run(host='0.0.0.0', port=port, debug=False)