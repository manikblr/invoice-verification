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

async function testDeployedAPI() {
  console.log('🚀 Testing DEPLOYED Invoice Validation API on Vercel...\n');
  
  // Test different deployment URLs
  const deploymentUrls = [
    'https://invoice-verification.vercel.app',
    'https://invoice-verification-staging.vercel.app',
    'https://invoice-verification-git-main-manik-singlas-projects.vercel.app'
  ];

  for (const baseUrl of deploymentUrls) {
    console.log(`\n📍 Testing deployment: ${baseUrl}`);
    console.log('=========================================\n');
    
    try {
      // First check if the deployment is accessible
      console.log('🔄 Checking deployment health...');
      const healthCheck = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      }).catch(err => null);

      if (!healthCheck || !healthCheck.ok) {
        console.log(`⚠️  Deployment at ${baseUrl} is not responding properly`);
        continue;
      }
      
      console.log('✅ Deployment is accessible!\n');

      // Test the validate-enhanced endpoint
      console.log('🔄 Calling /api/validate-enhanced endpoint...\n');
      
      const response = await fetch(`${baseUrl}/api/validate-enhanced`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload)
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('❌ API returned error:', response.status);
        console.error(JSON.stringify(responseData, null, 2));
        continue;
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
          
          // Check for Web Search Agent specifically
          if (agentName.includes('Web Search')) {
            console.log(`   ⚠️  WEB SEARCH AGENT STATUS CHECK:`);
            traces.forEach(trace => {
              if (trace.outputData) {
                if (trace.outputData.status === 'disabled') {
                  console.log(`   ❌ DISABLED - Feature flag FEATURE_WEB_INGEST is not enabled!`);
                } else if (trace.outputData.status === 'skipped') {
                  console.log(`   ⏭️  SKIPPED - High confidence match found`);
                } else if (trace.outputData.status === 'completed') {
                  console.log(`   ✅ COMPLETED - Searched vendors and created canonical items`);
                }
              }
            });
          }
          
          traces.forEach(trace => {
            console.log(`   - Stage: ${trace.agentStage}`);
            console.log(`     Status: ${trace.status}`);
            console.log(`     Time: ${trace.executionTime}ms`);
            if (trace.decisionRationale) {
              console.log(`     Decision: ${trace.decisionRationale}`);
            }
          });
        });

        // Check specifically for Web Search Agent issues
        const webSearchTraces = responseData.agentTraces.filter(t => 
          t.agentName.includes('Web Search') || t.agentName.includes('Web Ingest')
        );
        
        if (webSearchTraces.length === 0) {
          console.log('\n⚠️  WARNING: No Web Search Agent traces found!');
          console.log('This might indicate the agent is not being executed at all.');
        } else {
          webSearchTraces.forEach(trace => {
            if (trace.outputData && trace.outputData.message) {
              if (trace.outputData.message.includes('disabled')) {
                console.log('\n❌ ISSUE FOUND: Web Search Agent is DISABLED in production!');
                console.log('The FEATURE_WEB_INGEST environment variable is not set to "true" in Vercel.');
              }
            }
          });
        }
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

      console.log('\n✅ Deployment test completed for', baseUrl);
      break; // Only test the first working deployment

    } catch (error) {
      console.error(`❌ Test failed for ${baseUrl}:`, error.message);
    }
  }
}

// Run the test
testDeployedAPI().catch(console.error);