#!/usr/bin/env node

const fetch = require('node-fetch');

// Test data with Hydro Jetter
const testPayload = {
  scopeOfWork: "Preventive maintenance and pipe cleaning services for plumbing system",
  serviceLineId: 1,  // Required field
  serviceTypeId: 1,  // Required field
  laborHours: 8,
  includeAgentTraces: true,
  explanationLevel: 3,
  items: [
    {
      name: "Hydro Jetter",
      type: "equipment",
      quantity: 1,
      unitPrice: 3500.00,
      unit: "each",
      additionalContext: "High-pressure water jetting equipment for pipe cleaning"
    },
    {
      name: "Pipe Camera Inspection System",
      type: "equipment", 
      quantity: 1,
      unitPrice: 1200.00,
      unit: "each"
    },
    {
      name: "PVC Pipe 2 inch",
      type: "material",
      quantity: 50,
      unitPrice: 15.00,
      unit: "ft"
    },
    {
      name: "Labor charges",  // This should be rejected as blacklisted
      type: "labor",
      quantity: 8,
      unitPrice: 75.00,
      unit: "hours"
    },
    {
      name: "Drywall Mud",
      type: "material",
      quantity: 5,
      unitPrice: 25.00,
      unit: "bucket"
    },
    {
      name: "Electrical Conduit",
      type: "material",
      quantity: 20,
      unitPrice: 12.50,
      unit: "ft"
    }
  ]
};

async function testAPI() {
  console.log('🚀 Testing Invoice Validation API with Hydro Jetter and other items...\n');
  console.log('📦 Test Payload:');
  console.log(JSON.stringify(testPayload, null, 2));
  console.log('\n-----------------------------------\n');

  try {
    // First, let's check if the server is running
    const port = 3001; // Updated to use port 3001
    const healthCheck = await fetch(`http://localhost:${port}/api/health`).catch(err => null);
    if (!healthCheck || !healthCheck.ok) {
      console.log('⚠️  Server not running. Starting development server...');
      console.log('Please run: npm run dev');
      console.log('\nThen run this test again in a new terminal.');
      return;
    }

    // Test the validate-enhanced endpoint
    console.log('🔄 Calling /api/validate-enhanced endpoint...\n');
    
    const response = await fetch(`http://localhost:${port}/api/validate-enhanced`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('❌ API returned error:', response.status);
      console.error(responseData);
      return;
    }

    console.log('✅ API Response received!\n');
    console.log('📊 Overall Status:', responseData.overallStatus);
    console.log('📈 Summary:', responseData.summary);
    console.log(`⏱️  Execution Time: ${responseData.totalExecutionTime}ms`);
    console.log(`🔍 Trace ID: ${responseData.traceId}`);
    
    console.log('\n📋 Line Item Results:');
    console.log('-----------------------------------');
    
    responseData.lines.forEach((line, index) => {
      const icon = line.status === 'ALLOW' ? '✅' : 
                   line.status === 'REJECT' ? '❌' : '⚠️';
      console.log(`\n${icon} Item ${index + 1}: ${line.input.name}`);
      console.log(`   Status: ${line.status}`);
      console.log(`   Confidence: ${(line.confidenceScore * 100).toFixed(1)}%`);
      console.log(`   Reason: ${line.reasonCodes.join(', ')}`);
      if (line.explanation && line.explanation.summary) {
        console.log(`   Explanation: ${line.explanation.summary}`);
      }
    });

    // Show agent traces if available
    if (responseData.agentTraces && responseData.agentTraces.length > 0) {
      console.log('\n🤖 Agent Execution Traces:');
      console.log('-----------------------------------');
      
      // Group by agent name
      const agentGroups = {};
      responseData.agentTraces.forEach(trace => {
        if (!agentGroups[trace.agentName]) {
          agentGroups[trace.agentName] = [];
        }
        agentGroups[trace.agentName].push(trace);
      });

      Object.entries(agentGroups).forEach(([agentName, traces]) => {
        console.log(`\n📌 ${agentName}:`);
        traces.forEach(trace => {
          console.log(`   - Stage: ${trace.agentStage}`);
          console.log(`     Status: ${trace.status}`);
          console.log(`     Time: ${trace.executionTime}ms`);
          if (trace.decisionRationale) {
            console.log(`     Decision: ${trace.decisionRationale}`);
          }
        });
      });
    }

    // Show execution summary
    if (responseData.executionSummary) {
      console.log('\n📊 Execution Summary:');
      console.log('-----------------------------------');
      console.log(`Total Agents: ${responseData.executionSummary.totalAgents}`);
      console.log(`Total Time: ${responseData.executionSummary.totalExecutionTime}ms`);
      console.log(`Average Confidence: ${(responseData.executionSummary.averageConfidence * 100).toFixed(1)}%`);
      if (responseData.executionSummary.bottlenecks && responseData.executionSummary.bottlenecks.length > 0) {
        console.log(`Bottlenecks: ${responseData.executionSummary.bottlenecks.join(', ')}`);
      }
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error);
  }
}

// Run the test
testAPI();