// Test enhanced validation API with original testing data
const testData = {
  "scopeOfWork": "General maintenance and supplies for office facility",
  "serviceLineId": 1,
  "serviceTypeId": 2,
  "laborHours": 4,
  "items": [
    {
      "name": "Mud",
      "quantity": 10,
      "unit": "pcs",
      "unitPrice": 3,
      "type": "material"
    },
    {
      "name": "Chalk",
      "quantity": 5,
      "unit": "pcs", 
      "unitPrice": 5,
      "type": "material"
    }
  ],
  "includeAgentTraces": true,
  "includeDetailedExplanations": true,
  "explanationLevel": 3
};

async function testEnhancedValidation() {
  try {
    console.log('Testing Enhanced Validation API...');
    console.log('Test data:', JSON.stringify(testData, null, 2));
    
    const response = await fetch('http://localhost:3000/api/validate-enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });
    
    const result = await response.json();
    
    console.log('\n=== VALIDATION RESULTS ===');
    console.log('Status:', response.status);
    console.log('Overall Status:', result.overallStatus);
    console.log('Summary:', result.summary);
    console.log('Total Execution Time:', result.totalExecutionTime + 'ms');
    
    if (result.lines) {
      console.log('\n=== LINE ITEM RESULTS ===');
      result.lines.forEach((line, index) => {
        console.log(`\nItem ${index + 1}: ${line.input.name}`);
        console.log('- Status:', line.status);
        console.log('- Confidence:', line.confidenceScore);
        console.log('- Reason Codes:', line.reasonCodes);
        console.log('- Summary:', line.explanation?.summary);
      });
    }
    
    if (result.agentTraces) {
      console.log('\n=== AGENT EXECUTION TRACES ===');
      result.agentTraces.forEach(agent => {
        console.log(`${agent.agentName} (${agent.agentStage}): ${agent.executionTime}ms - ${agent.status}`);
      });
    }
    
    if (result.executionSummary) {
      console.log('\n=== EXECUTION SUMMARY ===');
      console.log('Total Agents:', result.executionSummary.totalAgents);
      console.log('Average Confidence:', result.executionSummary.averageConfidence);
      console.log('Critical Path:', result.executionSummary.criticalPath);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testEnhancedValidation();