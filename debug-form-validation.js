// Test form validation behavior
async function testFormValidation() {
  console.log('Testing form validation with missing service fields...\n');
  
  // Simulate form data with missing service fields (like user reported)
  const testData = {
    scopeOfWork: 'sample scope',
    serviceLineId: 0,  // Default unselected
    serviceTypeId: 0,  // Default unselected
    laborHours: 0,
    items: [
      {
        name: 'sample item',
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
  
  console.log('Attempting to submit with these values:');
  console.log('- Scope:', testData.scopeOfWork);
  console.log('- Service Line ID:', testData.serviceLineId);
  console.log('- Service Type ID:', testData.serviceTypeId);
  console.log('- Item Name:', testData.items[0].name);
  console.log('- Item Price:', testData.items[0].unitPrice);
  console.log();
  
  try {
    const response = await fetch('http://localhost:3000/api/validate-enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.log('✅ WORKING: API validation blocked the request');
      console.log('Error:', error.error);
      console.log('HTTP Status:', response.status);
      console.log('\nThis means the frontend should show an alert saying:');
      console.log(`"Failed to validate invoice: ${error.error}"`);
    } else {
      const result = await response.json();
      console.log('❌ NOT WORKING: API accepted the request');
      console.log('Response Status:', result.overallStatus);
      console.log('This means validation is not working properly.');
    }
    
  } catch (error) {
    console.log('Request failed:', error.message);
  }
}

testFormValidation();