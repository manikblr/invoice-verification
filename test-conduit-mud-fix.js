#!/usr/bin/env node
/**
 * Test Web Search Agent Canonical Item Creation Fix
 * Specifically tests "Conduit" and "Mud" materials to verify:
 * 1. Web Search Agent finds matches and creates canonical items
 * 2. Price Learner Agent uses the newly created canonical items
 * 3. Full pipeline works with web-discovered items
 */

async function testConduitAndMud() {
  console.log('🔧 TESTING WEB SEARCH CANONICAL ITEM CREATION FIX')
  console.log('='.repeat(55))
  console.log('Testing "Conduit" and "Mud" materials for enhanced web search flow...\n')
  
  const testCases = [
    {
      name: 'Conduit Test',
      material: 'Conduit',
      expectedCanonical: 'WS_ELECTRICAL_CONDUIT_001',
      expectedPriceRange: { min: 8.50, max: 15.75 }
    },
    {
      name: 'Mud Test', 
      material: 'Mud',
      expectedCanonical: 'WS_DRYWALL_MUD_001',
      expectedPriceRange: { min: 18.00, max: 35.00 }
    }
  ]
  
  for (const testCase of testCases) {
    console.log(`🧪 ${testCase.name.toUpperCase()}`)
    console.log('─'.repeat(30))
    
    const testPayload = {
      scopeOfWork: `Office renovation requiring ${testCase.material.toLowerCase()}`,
      serviceLineId: "construction-materials",
      serviceTypeId: "facility-maintenance",
      laborHours: 40,
      includeAgentTraces: true,
      explanationLevel: 3,
      items: [{
        name: testCase.material,
        type: "material",
        quantity: 10,
        unitPrice: 12.50, // Should fall within web-discovered price range
        unit: "pieces"
      }]
    }
    
    try {
      const response = await fetch('http://localhost:3001/api/validate-enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const result = await response.json()
      
      console.log(`✅ Validation completed: ${result.overallStatus}`)
      
      // Test 1: Item Matcher Agent (should have low confidence)
      const itemMatcherAgent = result.agentTraces?.find(agent => 
        agent.agentName.includes('Item Matcher')
      )
      
      if (itemMatcherAgent) {
        const matchConfidence = itemMatcherAgent.outputData?.confidence || 0
        console.log(`📊 Item Matcher: ${Math.round(matchConfidence * 100)}% confidence${matchConfidence < 0.7 ? ' (triggers web search)' : ' (skips web search)'}`)
        
        if (matchConfidence < 0.7) {
          console.log('✅ Low confidence match - Web Search Agent should activate')
        } else {
          console.log('⚠️ High confidence match - Web Search Agent may be skipped')
        }
      }
      
      // Test 2: Web Search Agent (should create canonical item)
      const webSearchAgent = result.agentTraces?.find(agent => 
        agent.agentName.includes('Web Search')
      )
      
      if (webSearchAgent) {
        console.log(`🌐 Web Search Agent: ${webSearchAgent.outputData?.status || 'unknown'}`)
        
        if (webSearchAgent.outputData?.canonicalItemId) {
          console.log(`✅ Canonical item created: ${webSearchAgent.outputData.canonicalItemId}`)
          console.log(`📝 Canonical name: ${webSearchAgent.outputData.canonicalName}`)
          
          if (webSearchAgent.outputData.priceRange) {
            const range = webSearchAgent.outputData.priceRange
            console.log(`💰 Price range discovered: $${range.min} - $${range.max}`)
          }
        } else {
          console.log('❌ No canonical item created by Web Search Agent')
        }
        
        console.log(`🔍 Search result: ${webSearchAgent.outputData?.message}`)
        console.log(`🌐 Vendors searched: ${webSearchAgent.outputData?.vendorsSearched?.join(', ') || 'None'}`)
      } else {
        console.log('❌ Web Search Agent not found in execution trace')
      }
      
      // Test 3: Price Learner Agent (should use web-discovered canonical item)
      const priceLearnerAgent = result.agentTraces?.find(agent => 
        agent.agentName.includes('Price Learner')
      )
      
      if (priceLearnerAgent) {
        console.log(`💰 Price Learner Agent: ${priceLearnerAgent.outputData?.message || 'unknown'}`)
        
        if (priceLearnerAgent.inputData?.canonicalItemId) {
          console.log(`✅ Using canonical item: ${priceLearnerAgent.inputData.canonicalItemId}`)
        } else {
          console.log('❌ Price Learner Agent missing canonical item ID')
        }
        
        if (priceLearnerAgent.outputData?.source) {
          console.log(`📊 Price source: ${priceLearnerAgent.outputData.source}`)
          
          if (priceLearnerAgent.outputData.source === 'web-search') {
            console.log('✅ Using web-discovered price data!')
          } else {
            console.log(`ℹ️ Using ${priceLearnerAgent.outputData.source} price data`)
          }
        }
        
        console.log(`🎯 Price validation: ${priceLearnerAgent.outputData?.isValid ? 'VALID' : 'INVALID'}`)
      } else {
        console.log('❌ Price Learner Agent not found in execution trace')
      }
      
      // Test 4: Final line item result
      const lineItem = result.lines[0]
      if (lineItem) {
        console.log(`📋 Final Status: ${lineItem.status}`)
        console.log(`🎯 Final Confidence: ${Math.round((lineItem.confidenceScore || 0) * 100)}%`)
        console.log(`📝 Explanation: ${lineItem.explanation?.summary?.substring(0, 100) || 'No summary'}...`)
      }
      
      // Verify the complete pipeline integration
      const webSearchCreatedCanonical = webSearchAgent?.outputData?.canonicalItemId
      const priceLearnerUsedCanonical = priceLearnerAgent?.inputData?.canonicalItemId
      const finalItemCanonical = lineItem?.explanation?.technical?.includes('Canonical match:')
      
      console.log('\n🔗 Pipeline Integration Check:')
      if (webSearchCreatedCanonical && priceLearnerUsedCanonical === webSearchCreatedCanonical) {
        console.log('✅ Web Search → Price Learner integration working!')
      } else {
        console.log(`❌ Integration issue: Web search created "${webSearchCreatedCanonical}", Price learner used "${priceLearnerUsedCanonical}"`)
      }
      
    } catch (error) {
      console.error(`❌ ${testCase.name} failed:`, error.message)
    }
    
    console.log('\n' + '='.repeat(55) + '\n')
  }
  
  console.log('🏆 FINAL ASSESSMENT')
  console.log('The Web Search Agent should now:')
  console.log('1. ✅ Create canonical items when matches are found')
  console.log('2. ✅ Pass canonical item IDs to Price Learner Agent')  
  console.log('3. ✅ Provide price ranges from web-discovered data')
  console.log('4. ✅ Enable full pipeline validation for unknown items')
  
  console.log('\n🌐 Visit http://localhost:3001 and test:')
  console.log('   • Enter "Conduit" as material')
  console.log('   • Enter "Mud" as material') 
  console.log('   • Check the Agent Details table')
  console.log('   • Verify Web Search Agent shows canonical creation')
  console.log('   • Verify Price Learner uses web-discovered prices')
}

// Run the test
if (require.main === module) {
  testConduitAndMud().catch(console.error)
}

module.exports = { testConduitAndMud }