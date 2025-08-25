// Mock implementation for transparency DB - to be replaced with real DB once tables are set up
import { ValidationSession, AgentExecution, ValidationTrace, LineItemValidation } from './types/transparency'

export class MockTransparencyDB {
  private sessions: Map<string, ValidationSession> = new Map()
  private executions: Map<string, AgentExecution[]> = new Map()

  async createValidationSession(data: any): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const session: ValidationSession = {
      id: sessionId,
      invoiceId: data.invoiceId,
      userSession: data.userSession,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      invoiceData: data.invoiceData,
      validationResults: data.validationResults,
      overallStatus: data.overallStatus,
      totalExecutionTime: data.totalExecutionTime,
      langfuseTraceId: data.langfuseTraceId,
      serviceLineName: data.serviceLineName,
      notes: data.notes
    }
    
    this.sessions.set(sessionId, session)
    this.executions.set(sessionId, [])
    
    console.log(`Mock DB: Created validation session ${sessionId}`)
    return sessionId
  }

  async getValidationSession(invoiceId: string): Promise<ValidationSession | null> {
    for (const session of Array.from(this.sessions.values())) {
      if (session.invoiceId === invoiceId) {
        console.log(`Mock DB: Found validation session for invoice ${invoiceId}`)
        return session
      }
    }
    console.log(`Mock DB: No session found for invoice ${invoiceId}`)
    return null
  }

  async createAgentExecution(execution: Omit<AgentExecution, 'id' | 'createdAt'>): Promise<string> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const agentExecution: AgentExecution = {
      ...execution,
      id: executionId,
      createdAt: new Date().toISOString()
    }
    
    const sessionExecutions = this.executions.get(execution.sessionId) || []
    sessionExecutions.push(agentExecution)
    this.executions.set(execution.sessionId, sessionExecutions)
    
    console.log(`Mock DB: Created agent execution ${executionId} for session ${execution.sessionId}`)
    return executionId
  }

  async getAgentExecutions(sessionId: string): Promise<AgentExecution[]> {
    const executions = this.executions.get(sessionId) || []
    console.log(`Mock DB: Retrieved ${executions.length} agent executions for session ${sessionId}`)
    return executions
  }

  async getValidationTrace(invoiceId: string): Promise<ValidationTrace | null> {
    const session = await this.getValidationSession(invoiceId)
    if (!session) return null

    const agentExecutions = await this.getAgentExecutions(session.id)
    
    // Mock line items - in real implementation, this would be fetched from the database
    const lineItems: LineItemValidation[] = []
    
    const trace: ValidationTrace = {
      session,
      agentExecutions,
      lineItems,
      explanations: [],
      decisionFactors: []
    }

    console.log(`Mock DB: Generated validation trace for invoice ${invoiceId}`)
    return trace
  }

  async updateValidationSession(sessionId: string, updates: Partial<ValidationSession>): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      Object.assign(session, updates, { updatedAt: new Date().toISOString() })
      this.sessions.set(sessionId, session)
      console.log(`Mock DB: Updated validation session ${sessionId}`)
    }
  }

  // Additional methods for completeness
  async createLineItemValidation(validation: any): Promise<string> {
    const id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    console.log(`Mock DB: Created line item validation ${id}`)
    return id
  }

  async createValidationExplanation(explanation: any): Promise<string> {
    const id = `expl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    console.log(`Mock DB: Created validation explanation ${id}`)
    return id
  }
}

// Export singleton instance
export const mockTransparencyDB = new MockTransparencyDB()