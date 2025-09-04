// Test the complete re-validation flow to check agent pipeline behavior
async function testRevalidationFlow() {
  console.log('=== Testing Complete Re-validation Flow ===\n');
  
  // Step 1: Submit item that will trigger NEEDS_REVIEW
  console.log('Step 1: Submitting item that should trigger NEEDS_REVIEW...');
  const initialPayload = {
    scopeOfWork: 'HVAC - Baseboard Heater Repair or Replace',
    serviceLineId: 1,  // HVAC
    serviceTypeId: 1,  // Baseboard Heater
    laborHours: 0,
    items: [
      {
        name: 'xsaxa',  // This should trigger NEEDS_REVIEW
        quantity: 1,
        unitPrice: 100,
        unit: 'pcs',
        type: 'material'
      }
    ],
    includeAgentTraces: true,
    includeDetailedExplanations: true,
    explanationLevel: 2
  };
  
  try {
    const response1 = await fetch('http://localhost:3000/api/validate-enhanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initialPayload)
    });
    
    if (response1.ok) {
      const result1 = await response1.json();
      console.log('Initial validation result:');
      console.log('- Overall Status:', result1.overallStatus);
      console.log('- Agents Executed:', result1.executionSummary.totalAgents);
      console.log('- First item status:', result1.lines[0]?.status);
      
      if (result1.lines[0]?.status === 'NEEDS_REVIEW') {
        console.log('✅ Step 1 SUCCESS: Item triggered NEEDS_REVIEW as expected\n');
        
        // Step 2: Re-validate with additional context
        console.log('Step 2: Re-validating with user context...');
        const revalidationPayload = {
          ...initialPayload,
          items: [
            {
              ...initialPayload.items[0],
              additionalContext: 'This is a specialized HVAC component needed for the baseboard heater repair'
            }
          ]
        };
        
        const response2 = await fetch('http://localhost:3000/api/validate-enhanced', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(revalidationPayload)
        });
        
        if (response2.ok) {
          const result2 = await response2.json();
          console.log('Re-validation result:');
          console.log('- Overall Status:', result2.overallStatus);
          console.log('- Agents Executed:', result2.executionSummary.totalAgents);
          console.log('- Item status:', result2.lines[0]?.status);
          
          if (result2.executionSummary.totalAgents <= 3) {
            console.log('✅ PIPELINE OPTIMIZATION WORKING: Only', result2.executionSummary.totalAgents, 'agents ran');
          } else {
            console.log('❌ PIPELINE ISSUE: Too many agents ran (', result2.executionSummary.totalAgents, '). Should be ≤3');
          }
          
          if (result2.lines[0]?.status !== 'NEEDS_REVIEW') {
            console.log('✅ FINAL DECISION WORKING: No more NEEDS_REVIEW loop');
          } else {
            console.log('❌ ENDLESS LOOP: Still returning NEEDS_REVIEW with context');
          }
        }
      } else {
        console.log('❌ Step 1 FAILED: Expected NEEDS_REVIEW but got:', result1.lines[0]?.status);
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testRevalidationFlow();