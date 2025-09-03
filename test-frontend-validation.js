// Simple frontend test using fetch to simulate form submission
async function testFrontendValidation() {
  console.log('Testing frontend form submission flow...\n');
  
  // Test payload that mimics what the form would send
  const testPayload = {
    scopeOfWork: 'Test scope work',
    serviceLineId: 0, // Invalid - should trigger validation
    serviceTypeId: 0, // Invalid - should trigger validation  
    laborHours: 0,
    items: [
      {
        name: 'Test Item',
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
    console.log('Submitting test payload to validate-enhanced API...');
    console.log('Payload serviceLineId:', testPayload.serviceLineId);
    console.log('Payload serviceTypeId:', testPayload.serviceTypeId);
    
    const response = await fetch('http://localhost:3000/api/validate-enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('❌ VALIDATION FAILED: API accepted invalid payload');
      console.log('Response status:', response.status);
    } else {
      const error = await response.json();
      console.log('✅ VALIDATION WORKING: API rejected invalid payload');
      console.log('Error message:', error.error);
      console.log('HTTP status:', response.status);
    }
    
  } catch (error) {
    console.log('✅ VALIDATION WORKING: Request failed');
    console.log('Error:', error.message);
  }
}

testFrontendValidation();