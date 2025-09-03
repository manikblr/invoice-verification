#!/usr/bin/env node
/**
 * Test to verify Web Search Agent is now enabled
 * Should see actual web search activity instead of "disabled" messages
 */

const testPayload = {
  scopeOfWork: "Office renovation requiring specialized materials",
  serviceLineId: "construction-materials",
  serviceTypeId: "facility-maintenance", 
  laborHours: 40,
  includeAgentTraces: true,
  explanationLevel: 3,
  items: [
    {
      name: "mud", // Low confidence match - should trigger web search
      type: "material",
      quantity: 5,
      unitPrice: 25.50,
      unit: "gallons"
    },
    {
      name: "specialized roofing membrane", // Likely unknown item - should trigger web search
      type: "material",
      quantity: 2,
      unitPrice: 450.00,
      unit: "rolls"
    }
  ]
}

async function testWebSearchAgent() {
  console.log('🌐 Testing Web Search Agent Enablement')
  console.log('='.repeat(50))
  console.log('Checking if Web Search & Ingest Agent is now active...\n')
  
  try {
    const response = await fetch('http://localhost:3001/api/validate-enhanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    console.log('✅ Validation completed successfully!')
    console.log(`📊 Total agents executed: ${result.agentTraces?.length || 0}`)
    
    // Find Web Search Agent executions
    const webSearchAgents = result.agentTraces?.filter(agent => 
      agent.agentName.includes('Web Search') || agent.agentName.includes('Ingest')
    ) || []
    
    if (webSearchAgents.length === 0) {
      console.log('❌ No Web Search Agent executions found')
      return
    }
    
    console.log(`\n🔍 Found ${webSearchAgents.length} Web Search Agent executions:`)
    
    webSearchAgents.forEach((agent, index) => {
      console.log(`\n📊 Web Search Agent #${index + 1}:`)
      console.log(`   Name: ${agent.agentName}`)
      console.log(`   Stage: ${agent.agentStage}`)
      console.log(`   Status: ${agent.status}`)
      console.log(`   Execution Time: ${agent.executionTime}ms`)
      
      // Check if it's actually searching or just disabled
      const output = agent.outputData
      console.log(`   Output: ${JSON.stringify(output, null, 2)}`)
      
      if (output && output.status === 'disabled') {
        console.log('   ❌ Web Search Agent still disabled')
      } else if (output && output.status === 'skipped') {
        console.log('   ⚠️ Web Search Agent skipped (high confidence match)')
      } else if (output && output.status === 'completed') {
        console.log('   ✅ Web Search Agent actively searching!')
        console.log(`   🌐 Vendors searched: ${output.vendorsSearched?.join(', ') || 'None'}`)
        console.log(`   📦 Items found: ${output.itemsFound || 0}`)
      } else {
        console.log('   ❓ Web Search Agent status unclear')
      }
    })
    
    // Test items that should trigger web search (low confidence matches)
    console.log('\n🎯 Testing Low Confidence Items (should trigger web search):')
    
    result.lines.forEach((line, index) => {
      const itemName = line.input?.name || 'Unknown'
      const confidence = Math.round((line.confidenceScore || 0) * 100)
      
      console.log(`\n📋 Item ${index + 1}: "${itemName}"`)
      console.log(`   Confidence: ${confidence}%`)
      console.log(`   Status: ${line.status}`)
      
      if (confidence < 70) {
        console.log('   🔍 Low confidence - should have triggered web search')
      } else {
        console.log('   ✅ High confidence - web search may have been skipped')
      }
    })
    
    // Summary
    const enabledAgents = webSearchAgents.filter(agent => 
      agent.outputData && 
      agent.outputData.status !== 'disabled' && 
      agent.outputData.status !== 'skipped'
    )
    
    console.log('\n🏆 SUMMARY:')
    if (enabledAgents.length > 0) {
      console.log('✅ Web Search Agent is ENABLED and actively working!')
      console.log(`   ${enabledAgents.length} web search operations executed`)
    } else if (webSearchAgents.some(a => a.outputData?.status === 'skipped')) {
      console.log('⚠️ Web Search Agent is enabled but skipped (high confidence matches)')
      console.log('   Try testing with more obscure item names to trigger web search')
    } else {
      console.log('❌ Web Search Agent still appears to be disabled')
      console.log('   Check FEATURE_WEB_INGEST environment variable')
    }
    
    return result
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    throw error
  }
}

// Run the test
if (require.main === module) {
  testWebSearchAgent().catch(console.error)
}

module.exports = { testWebSearchAgent }