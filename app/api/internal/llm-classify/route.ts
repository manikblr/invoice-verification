/**
 * Internal API endpoint for Langfuse LLM classification
 * Bridges TypeScript validation system to Python Langfuse integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as path from 'path';

interface LLMClassifyRequest {
  prompt_name: string;
  variables: Record<string, any>;
  task_type?: string;
  trace_name?: string;
  metadata?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    const body: LLMClassifyRequest = await request.json();
    
    // Validate required fields
    if (!body.prompt_name || !body.variables) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt_name, variables' },
        { status: 400 }
      );
    }

    // Call Python Langfuse integration
    const pythonResponse = await callPythonLangfuse(body);
    
    return NextResponse.json({
      success: true,
      response: pythonResponse,
      metadata: {
        prompt_name: body.prompt_name,
        trace_name: body.trace_name,
        timestamp: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error('[Internal LLM Classify] Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Call Python Langfuse integration script
 */
async function callPythonLangfuse(request: LLMClassifyRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    // Path to the Python Langfuse integration script
    const scriptPath = path.join(process.cwd(), 'agents', 'langfuse_integration.py');
    
    // Prepare the input data
    const inputData = JSON.stringify({
      action: 'classify_with_prompt',
      prompt_name: request.prompt_name,
      variables: request.variables,
      task_type: request.task_type || 'validation',
      trace_name: request.trace_name || 'llm_classify',
      metadata: request.metadata || {},
    });

    // Spawn Python process
    const python = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    // Send input data to Python script
    python.stdin.write(inputData);
    python.stdin.end();

    // Collect output
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle completion
    python.on('close', (code) => {
      if (code !== 0) {
        console.error('[Python Langfuse] Process failed:', stderr);
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Parse the response from Python
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        
        // The Python script should output JSON on the last line
        const result = JSON.parse(lastLine);
        
        if (result.error) {
          reject(new Error(`Python Langfuse error: ${result.error}`));
        } else {
          resolve(result.response || result);
        }
      } catch (parseError) {
        console.error('[Python Langfuse] Failed to parse response:', stdout);
        reject(new Error(`Failed to parse Python response: ${parseError}`));
      }
    });

    // Handle process errors
    python.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });

    // Set timeout
    setTimeout(() => {
      python.kill();
      reject(new Error('Python Langfuse call timed out'));
    }, 30000); // 30 second timeout
  });
}