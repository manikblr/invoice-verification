import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export const dynamic = 'force-dynamic'

interface ValidationRequest {
  name: string
  description?: string
  category?: string
  user_id?: string
}

interface ValidationResult {
  decision: 'approved' | 'rejected' | 'needs_review'
  confidence: number
  reason: string
  details: string
}

/**
 * Validate item submissions using CrewAI agents with Langfuse prompt management
 * This endpoint is designed to catch user abuse and inappropriate submissions
 */
export async function POST(request: Request) {
  try {
    const body: ValidationRequest = await request.json()
    
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json({
        error: 'Item name is required'
      }, { status: 400 })
    }

    // Log the validation attempt for monitoring abuse patterns
    console.log(`[validate_item] Validating: "${body.name}" by user ${body.user_id || 'anonymous'}`)

    // Run the Python validation agent
    const result = await runValidationAgent(body)
    
    // Log the result for abuse monitoring
    if (result.decision === 'rejected') {
      console.warn(`[validate_item] REJECTED: "${body.name}" - ${result.reason}: ${result.details}`)
    } else if (result.decision === 'needs_review') {
      console.info(`[validate_item] FLAGGED: "${body.name}" - ${result.reason}: ${result.details}`)
    }

    return NextResponse.json({
      validation: result,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[validate_item] Error:', error)
    
    // Fail-safe: reject unknown items during errors
    return NextResponse.json({
      validation: {
        decision: 'needs_review',
        confidence: 0.0,
        reason: 'validation_error', 
        details: 'Unable to validate item due to system error'
      },
      timestamp: new Date().toISOString()
    })
  }
}

async function runValidationAgent(itemData: ValidationRequest): Promise<ValidationResult> {
  return new Promise((resolve, reject) => {
    // Path to the validation agent script
    const agentPath = path.join(process.cwd(), 'agents', 'validation_agent.py')
    
    // Spawn Python process using the virtual environment
    const pythonExecutable = path.join(process.cwd(), 'venv', 'bin', 'python')
    const pythonProcess = spawn(pythonExecutable, ['-c', `
import sys
import os
sys.path.append('${path.join(process.cwd(), 'agents')}')

from validation_agent import ValidationAgentCreator
import json

# Create validator
validator = ValidationAgentCreator()

# Item data from Node.js
item_data = {
    'name': '${itemData.name.replace(/'/g, "\\'")}',
    'description': '${(itemData.description || '').replace(/'/g, "\\'")}',
    'category': '${(itemData.category || '').replace(/'/g, "\\'")}',
    'user_id': '${(itemData.user_id || 'anonymous').replace(/'/g, "\\'")}'
}

# Run validation
try:
    crew = validator.create_validation_crew(item_data)
    result = crew.kickoff()
    
    # Parse the JSON result from the agent
    import re
    json_match = re.search(r'\\{[^{}]*"decision"[^{}]*\\}', str(result))
    if json_match:
        result_json = json.loads(json_match.group())
        print(json.dumps(result_json))
    else:
        # Fallback: use the validation tool directly
        validation_result = validator.validation_tool._run(
            item_data['name'], 
            item_data['description'], 
            f"Category: {item_data['category']}, User: {item_data['user_id']}"
        )
        print(validation_result)
        
except Exception as e:
    # Fallback validation on error
    fallback_result = {
        "decision": "needs_review",
        "confidence": 0.0,
        "reason": "agent_error",
        "details": f"Agent validation failed: {str(e)}"
    }
    print(json.dumps(fallback_result))
`], {
      cwd: process.cwd(),
      env: { ...process.env }
    })

    let output = ''
    let errorOutput = ''

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString()
    })

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    pythonProcess.on('close', (code) => {
      try {
        if (code !== 0) {
          console.error('[validate_item] Python process error:', errorOutput)
          // Return fallback validation on process error
          resolve({
            decision: 'needs_review',
            confidence: 0.0,
            reason: 'process_error',
            details: 'Validation process failed'
          })
          return
        }

        // Parse the JSON output from Python
        const lines = output.trim().split('\n')
        const lastLine = lines[lines.length - 1]
        
        try {
          const result = JSON.parse(lastLine)
          resolve(result)
        } catch (parseError) {
          console.error('[validate_item] JSON parse error:', parseError, 'Output:', lastLine)
          // Fallback validation result
          resolve({
            decision: 'needs_review',
            confidence: 0.0,
            reason: 'parse_error',
            details: 'Unable to parse validation result'
          })
        }
      } catch (error) {
        reject(error)
      }
    })

    pythonProcess.on('error', (error) => {
      console.error('[validate_item] Process spawn error:', error)
      resolve({
        decision: 'needs_review',
        confidence: 0.0,
        reason: 'spawn_error',
        details: 'Could not start validation process'
      })
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      pythonProcess.kill()
      resolve({
        decision: 'needs_review',
        confidence: 0.0,
        reason: 'timeout',
        details: 'Validation timed out'
      })
    }, 30000)
  })
}

/**
 * GET endpoint for testing the validation system
 */
export async function GET() {
  const testCases = [
    { name: 'PVC Pipe', description: '1/2 inch PVC pipe for plumbing', category: 'plumbing' },
    { name: 'Pizza', description: 'Delicious pepperoni pizza', category: 'food' },
    { name: 'Fucking wrench', description: 'This is inappropriate', category: 'tools' },
    { name: 'Wire nuts', description: 'Electrical wire connectors', category: 'electrical' },
    { name: 'My laptop', description: 'Personal computer', category: 'electronics' },
    { name: 'Drill bits', description: 'Set of metal drill bits', category: 'tools' }
  ]

  const results = []
  
  for (const testCase of testCases) {
    try {
      const result = await runValidationAgent(testCase)
      results.push({
        input: testCase,
        validation: result
      })
    } catch (error) {
      results.push({
        input: testCase,
        validation: {
          decision: 'error',
          confidence: 0.0,
          reason: 'test_error',
          details: `Test failed: ${error}`
        }
      })
    }
  }

  return NextResponse.json({
    message: 'Validation system test results',
    results,
    timestamp: new Date().toISOString()
  })
}