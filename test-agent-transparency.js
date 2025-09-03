#!/usr/bin/env node
/**
 * Synthetic test for agent transparency improvements
 * Tests the "How We Validated" section with realistic data
 */

const testValidationRequest = {
  scopeOfWork: "Office renovation project requiring various construction materials",
  serviceLineId: "construction-materials",
  serviceTypeId: "facility-maintenance", 
  laborHours: 40,
  includeAgentTraces: true,
  explanationLevel: 3,
  items: [
    {
      name: "mud", 
      type: "material",
      quantity: 5,
      unitPrice: 25.50,
      unit: "gallons"
    },
    {
      name: "drywall screws",
      type: "material", 
      quantity: 100,
      unitPrice: 0.15,
      unit: "pieces"
    },
    {
      name: "electrical wire",
      type: "material",
      quantity: 50,
      unitPrice: 2.25,
      unit: "feet"
    }
  ]
}

async function testAgentTransparency() {
  console.log('🧪 Testing Agent Transparency Improvements...')
  console.log('📤 Sending test validation request...')
  
  try {
    const response = await fetch('http://localhost:3001/api/validate-enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testValidationRequest)
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    console.log('✅ Validation completed successfully!')
    console.log(`📊 Overall Status: ${result.overallStatus}`)
    console.log(`🤖 Agents Executed: ${result.executionSummary?.totalAgents || 0}`)
    console.log(`⏱️ Total Execution Time: ${result.totalExecutionTime}ms`)
    console.log(`🎯 Average Confidence: ${Math.round((result.executionSummary?.averageConfidence || 0) * 100)}%`)
    
    // Test agent traces
    if (result.agentTraces && result.agentTraces.length > 0) {
      console.log('\n🔍 Agent Trace Summary:')
      result.agentTraces.forEach((agent, index) => {
        console.log(`  ${index + 1}. ${agent.agentName} (${agent.agentStage}) - ${agent.executionTime}ms - ${agent.status}`)
      })
    } else {
      console.log('⚠️ No agent traces found in response')
    }
    
    // Test line item results
    console.log('\n📋 Line Item Results:')
    result.lines.forEach((line, index) => {
      const itemName = line.input?.name || line.name || 'Unknown Item'
      console.log(`  ${index + 1}. "${itemName}" - ${line.status} (${Math.round(line.confidenceScore * 100)}% confidence)`)
    })
    
    // Check if "mud" item got NEEDS_REVIEW as expected
    const mudItem = result.lines.find(line => line.input?.name?.toLowerCase()?.includes('mud'))
    if (mudItem) {
      console.log(`\n🎯 Mud item validation: ${mudItem.status}`)
      if (mudItem.status === 'NEEDS_REVIEW') {
        console.log('✅ Expected NEEDS_REVIEW status for "mud" - transparency test passing!')
      } else {
        console.log(`⚠️ Unexpected status for "mud": ${mudItem.status}`)
      }
    }
    
    console.log('\n🌐 Test completed - Check localhost:3001 to see UI changes')
    return result
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    throw error
  }
}

// Run the test
testAgentTransparency().catch(console.error)