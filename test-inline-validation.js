// Test the new inline validation improvements
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
  "explanationLevel": 2
};

async function testInlineValidation() {
  console.log('🧪 Testing Inline Validation Improvements...\n');
  
  try {
    // Test 1: Initial validation (should show NEEDS_REVIEW for Mud and Chalk)
    console.log('📋 Step 1: Initial validation without context');
    const response = await fetch('http://localhost:3000/api/validate-enhanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    
    const result = await response.json();
    console.log('Overall Status:', result.overallStatus);
    console.log('Items:');
    result.lines.forEach((line, index) => {
      console.log(`  ${index + 1}. ${line.input.name}: ${line.status} - ${line.explanation?.summary?.substring(0, 60)}...`);
    });
    
    // Test 2: Re-validation with additional context
    console.log('\n📋 Step 2: Re-validation with additional context');
    const revalidationData = {
      ...testData,
      items: [
        {
          ...testData.items[0],
          additionalContext: "This mud is specifically needed for sealing gaps in the office building foundation as part of emergency maintenance work."
        }
      ]
    };
    
    const revalidationResponse = await fetch('http://localhost:3000/api/validate-enhanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(revalidationData)
    });
    
    const revalidationResult = await revalidationResponse.json();
    console.log('Re-validation Overall Status:', revalidationResult.overallStatus);
    console.log('Re-validated item:');
    if (revalidationResult.lines[0]) {
      const line = revalidationResult.lines[0];
      console.log(`  ${line.input.name}: ${line.status} - ${line.explanation?.summary?.substring(0, 60)}...`);
    }
    
    console.log('\n✅ Inline validation test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testInlineValidation();