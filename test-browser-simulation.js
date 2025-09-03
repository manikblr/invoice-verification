// Simulate exact user test: enter sample values and click validate
async function simulateUserTest() {
  console.log('Simulating user test: entering sample values and clicking validate...\n');
  
  // This simulates exactly what the form would send when user:
  // 1. Enters scope: "sample scope"
  // 2. Enters item name: "sample item"  
  // 3. Enters price: "100"
  // 4. Leaves service line and type unselected (defaults)
  // 5. Clicks validate
  
  const formData = {
    scopeOfWork: 'sample scope',
    serviceLineId: '', // Empty string (default from select)
    serviceTypeId: '', // Empty string (default from select)
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
  
  console.log('Form data being submitted:');
  console.log('- Scope:', formData.scopeOfWork);
  console.log('- Service Line ID:', formData.serviceLineId, '(type:', typeof formData.serviceLineId, ')');
  console.log('- Service Type ID:', formData.serviceTypeId, '(type:', typeof formData.serviceTypeId, ')');
  console.log('- Item name:', formData.items[0].name);
  console.log('- Item price:', formData.items[0].unitPrice);
  
  try {
    const response = await fetch('http://localhost:3000/api/validate-enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.log('\n✅ SUCCESS: Validation correctly blocked submission!');
      console.log('Error message that user will see:', error.error);
      console.log('HTTP status:', response.status);
      console.log('This should show as an alert: "Failed to validate invoice: ' + error.error + '"');
    } else {
      const result = await response.json();
      console.log('\n❌ PROBLEM: Form validation not working!');
      console.log('API accepted the request despite missing service fields');
      console.log('Overall status:', result.overallStatus);
    }
    
  } catch (error) {
    console.log('\n✅ SUCCESS: Request properly failed');
    console.log('Error:', error.message);
  }
}

simulateUserTest();