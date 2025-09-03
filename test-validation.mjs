import fetch from 'node-fetch';

async function testValidation() {
  console.log('Testing form validation directly via API...\n');
  
  // Test 1: Submit without service line and type
  console.log('Test 1: Submitting without service line and type...');
  try {
    const response = await fetch('http://localhost:3000/api/validate-enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scopeOfWork: 'Test scope',
        serviceLineId: 0,  // Invalid - should be rejected
        serviceTypeId: 0,  // Invalid - should be rejected
        laborHours: 0,
        items: [
          {
            name: 'Test Item',
            quantity: 1,
            unitPrice: 100,
            unit: 'pcs',
            type: 'material'
          }
        ]
      })
    });
    
    const result = await response.json();
    
    if (response.ok && !result.error) {
      console.log('❌ FAILED: API accepted request without service line/type');
      console.log('Response:', result);
    } else {
      console.log('✅ PASSED: API rejected request without service line/type');
      console.log('Error:', result.error || result.message);
    }
  } catch (error) {
    console.log('✅ PASSED: Request failed as expected');
    console.log('Error:', error.message);
  }
  
  console.log('\n---\n');
  
  // Test 2: Submit with valid service line and type
  console.log('Test 2: Submitting with valid service line and type...');
  try {
    const response = await fetch('http://localhost:3000/api/validate-enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scopeOfWork: 'Test scope',
        serviceLineId: 1,  // Valid
        serviceTypeId: 1,  // Valid
        laborHours: 0,
        items: [
          {
            name: 'Copper Pipe',
            quantity: 1,
            unitPrice: 100,
            unit: 'pcs',
            type: 'material'
          }
        ]
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ PASSED: API accepted valid request');
      console.log('Status:', result.status);
    } else {
      console.log('❌ FAILED: API rejected valid request');
      console.log('Error:', result);
    }
  } catch (error) {
    console.log('❌ FAILED: Valid request threw error');
    console.log('Error:', error.message);
  }
}

testValidation();