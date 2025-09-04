import { NextRequest, NextResponse } from 'next/server'
import { transparencyDB } from '@/lib/transparency-db'

export const dynamic = 'force-dynamic'

// Export validation report in various formats
export async function GET(
  req: NextRequest,
  { params }: { params: { invoiceId: string } }
) {
  try {
    const { invoiceId } = params
    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') || 'pdf'
    
    console.log(`Exporting validation report for ${invoiceId} in ${format} format`)
    
    // Get the validation data from the database
    const trace = await transparencyDB.getValidationTrace(invoiceId)
    
    if (!trace) {
      return NextResponse.json(
        { error: 'Validation data not found' },
        { status: 404 }
      )
    }
    
    if (format === 'pdf') {
      // Create a comprehensive HTML report that can be printed as PDF
      const { session, lineItems, agentExecutions } = trace
      
      const statusClass = session.overallStatus === 'ALLOW' ? 'approved' : 
                         session.overallStatus === 'REJECT' ? 'rejected' : 'review'
      
      const htmlReport = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Validation Report - ${invoiceId}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .section { margin-bottom: 30px; page-break-inside: avoid; }
            .invoice-id { background: #f0f0f0; padding: 10px; border-radius: 5px; font-family: monospace; }
            .status { padding: 5px 10px; border-radius: 3px; color: white; font-weight: bold; }
            .status.approved { background: #10b981; }
            .status.rejected { background: #ef4444; }
            .status.review { background: #f59e0b; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .agent-trace { background: #f8f9fa; padding: 15px; margin: 10px 0; border-left: 4px solid #007bff; }
            .line-item { background: #fff; border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .decision { font-weight: bold; padding: 3px 8px; border-radius: 3px; }
            .decision.ALLOW { background: #d1fae5; color: #065f46; }
            .decision.REJECT { background: #fee2e2; color: #991b1b; }
            .decision.NEEDS_REVIEW { background: #fef3c7; color: #92400e; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Invoice Validation Report</h1>
            <div class="invoice-id">Invoice ID: ${invoiceId}</div>
            <div class="status ${statusClass}">${session.overallStatus}</div>
            <p>Generated on: ${new Date().toLocaleString()}</p>
          </div>
          
          <div class="section">
            <h2>Executive Summary</h2>
            <table>
              <tr><th>Overall Status</th><td class="status ${statusClass}">${session.overallStatus}</td></tr>
              <tr><th>Total Items</th><td>${lineItems.length}</td></tr>
              <tr><th>Total Agents</th><td>${agentExecutions.length}</td></tr>
              <tr><th>Execution Time</th><td>${session.totalExecutionTime || 0}ms</td></tr>
              <tr><th>Service Line</th><td>${session.serviceLineName || 'N/A'}</td></tr>
              <tr><th>Validation Date</th><td>${new Date(session.createdAt).toLocaleString()}</td></tr>
            </table>
          </div>
          
          <div class="section">
            <h2>Scope of Work</h2>
            <p>${session.invoiceData.scopeOfWork}</p>
          </div>
          
          ${lineItems.length > 0 ? `
          <div class="section">
            <h2>Line Item Validation Results</h2>
            ${lineItems.map((item, idx) => `
              <div class="line-item">
                <h4>Item ${idx + 1}: ${item.itemName}</h4>
                <table>
                  <tr><th>Decision</th><td><span class="decision ${item.validationDecision}">${item.validationDecision}</span></td></tr>
                  <tr><th>Type</th><td>${item.itemType}</td></tr>
                  <tr><th>Quantity</th><td>${item.quantity || 'N/A'}</td></tr>
                  <tr><th>Unit Price</th><td>${item.unitPrice ? '$' + item.unitPrice.toFixed(2) : 'N/A'}</td></tr>
                  <tr><th>Unit</th><td>${item.unit || 'N/A'}</td></tr>
                  <tr><th>Confidence</th><td>${item.confidenceScore ? (item.confidenceScore * 100).toFixed(1) + '%' : 'N/A'}</td></tr>
                </table>
                ${item.primaryReason ? `<p><strong>Primary Reason:</strong> ${item.primaryReason}</p>` : ''}
                ${item.detailedExplanation ? `<p><strong>Detailed Explanation:</strong> ${item.detailedExplanation}</p>` : ''}
              </div>
            `).join('')}
          </div>
          ` : ''}
          
          ${agentExecutions.length > 0 ? `
          <div class="section">
            <h2>Agent Execution Trace</h2>
            ${agentExecutions.map((agent, idx) => `
              <div class="agent-trace">
                <h4>Agent ${idx + 1}: ${agent.agentName}</h4>
                <table>
                  <tr><th>Stage</th><td>${agent.agentStage}</td></tr>
                  <tr><th>Status</th><td>${agent.status}</td></tr>
                  <tr><th>Execution Time</th><td>${agent.executionTime}ms</td></tr>
                  <tr><th>Execution Order</th><td>${agent.executionOrder}</td></tr>
                  ${agent.confidenceScore ? `<tr><th>Confidence</th><td>${(agent.confidenceScore * 100).toFixed(1)}%</td></tr>` : ''}
                  ${agent.decisionRationale ? `<tr><th>Decision Rationale</th><td>${agent.decisionRationale}</td></tr>` : ''}
                </table>
              </div>
            `).join('')}
          </div>
          ` : ''}
          
          <div class="section">
            <h2>System Notes</h2>
            <p>This report was generated using the Enhanced Transparency System. For technical support or questions about this validation, please reference the Invoice ID above.</p>
            ${session.notes ? `<p><strong>Additional Notes:</strong> ${session.notes}</p>` : ''}
          </div>
        </body>
        </html>
      `
      
      return new NextResponse(htmlReport, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="validation-report-${invoiceId}.html"`
        }
      })
    }
    
    if (format === 'json') {
      const jsonReport = {
        invoiceId,
        exportedAt: new Date().toISOString(),
        format: 'json',
        validationData: {
          session: trace.session,
          lineItems: trace.lineItems,
          agentExecutions: trace.agentExecutions,
          explanations: trace.explanations,
          decisionFactors: trace.decisionFactors
        },
        metadata: {
          totalItems: trace.lineItems.length,
          totalAgents: trace.agentExecutions.length,
          totalExecutionTime: trace.session.totalExecutionTime
        }
      }
      
      return NextResponse.json(jsonReport, {
        headers: {
          'Content-Disposition': `attachment; filename="validation-data-${invoiceId}.json"`
        }
      })
    }
    
    return NextResponse.json(
      { error: `Unsupported export format: ${format}` },
      { status: 400 }
    )
    
  } catch (error) {
    console.error('Error exporting validation report:', error)
    return NextResponse.json(
      { 
        error: 'Failed to export validation report', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}