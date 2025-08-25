-- Create validation_session_summary view
CREATE OR REPLACE VIEW validation_session_summary AS
SELECT 
  vs.id,
  vs.invoice_id,
  vs.created_at,
  vs.overall_status,
  vs.total_execution_time,
  vs.service_line_name,
  vs.service_type_name,
  vs.item_count,
  COUNT(DISTINCT ae.id) as agent_count,
  COUNT(DISTINCT liv.id) as line_item_count,
  COUNT(DISTINCT CASE WHEN liv.validation_decision = 'ALLOW' THEN liv.id END) as approved_items,
  COUNT(DISTINCT CASE WHEN liv.validation_decision = 'NEEDS_REVIEW' THEN liv.id END) as review_items,
  COUNT(DISTINCT CASE WHEN liv.validation_decision = 'REJECT' THEN liv.id END) as rejected_items
FROM validation_sessions vs
LEFT JOIN agent_executions ae ON vs.id = ae.session_id
LEFT JOIN line_item_validations liv ON vs.id = liv.session_id
GROUP BY vs.id, vs.invoice_id, vs.created_at, vs.overall_status, vs.total_execution_time, 
         vs.service_line_name, vs.service_type_name, vs.item_count;