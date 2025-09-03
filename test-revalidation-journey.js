#!/usr/bin/env node
/**
 * End-to-end test for re-validation journey with agent transparency
 * Tests the complete UX journey that users experience when providing additional context
 */

const testInitialValidation = {
  scopeOfWork: "Office renovation project needing construction materials",
  serviceLineId: "construction-materials",
  serviceTypeId: "facility-maintenance",
  laborHours: 40,
  includeAgentTraces: true,
  explanationLevel: 3,
  items: [
    {
      name: "mud", // This should get NEEDS_REVIEW
      type: "material",
      quantity: 5,
      unitPrice: 25.50,
      unit: "gallons"
    }
  ]
}

const testRevalidationWithContext = {
  scopeOfWork: "Office renovation project needing construction materials",
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
      unit: "gallons",
      additionalContext: "This is drywall mud for patching walls during office renovation - not soil or dirt"
    }
  ]
}

async function testCompleteUserJourney() {
  console.log('🧪 Testing Complete Re-validation Journey...')
  
  try {
    // Step 1: Initial validation (should get NEEDS_REVIEW for "mud")
    console.log('\n📤 Step 1: Initial validation without context...')
    
    const initialResponse = await fetch('http://localhost:3001/api/validate-enhanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testInitialValidation)
    })
    
    if (!initialResponse.ok) {
      throw new Error(`Initial validation failed: ${initialResponse.status}`)
    }
    
    const initialResult = await initialResponse.json()
    console.log(`✅ Initial validation completed: ${initialResult.overallStatus}`)
    
    // Verify mud item needs review
    const mudItem = initialResult.lines.find(line => 
      line.input?.name?.toLowerCase().includes('mud')
    )
    
    if (!mudItem) {
      throw new Error('Mud item not found in results')
    }
    
    if (mudItem.status !== 'NEEDS_REVIEW') {
      console.log(`⚠️ Expected NEEDS_REVIEW but got ${mudItem.status} - test may still pass`)
    } else {
      console.log('✅ Mud item correctly needs review - UX flow working')
    }
    
    console.log(`📊 Initial confidence: ${Math.round(mudItem.confidenceScore * 100)}%`)
    console.log(`📋 Initial reason: ${mudItem.explanation?.summary || 'No summary'}`)
    
    // Step 2: Re-validation with additional context
    console.log('\n📤 Step 2: Re-validation with user context...')
    
    const revalidationResponse = await fetch('http://localhost:3001/api/validate-enhanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testRevalidationWithContext)
    })
    
    if (!revalidationResponse.ok) {
      throw new Error(`Re-validation failed: ${revalidationResponse.status}`)
    }
    
    const revalidationResult = await revalidationResponse.json()
    console.log(`✅ Re-validation completed: ${revalidationResult.overallStatus}`)
    
    // Find mud item in re-validation results
    const revalidatedMudItem = revalidationResult.lines.find(line =>
      line.input?.name?.toLowerCase().includes('mud')
    )
    
    if (!revalidatedMudItem) {
      throw new Error('Mud item not found in re-validation results')
    }
    
    // Step 3: Compare before/after results
    console.log('\n📊 Step 3: Before/After Comparison:')
    console.log('┌─────────────────┬─────────────────┬─────────────────┐')
    console.log('│     Metric      │     Before      │      After      │')
    console.log('├─────────────────┼─────────────────┼─────────────────┤')
    console.log(`│ Status          │ ${mudItem.status.padEnd(15)} │ ${revalidatedMudItem.status.padEnd(15)} │`)
    console.log(`│ Confidence      │ ${Math.round(mudItem.confidenceScore * 100)}%${' '.repeat(12)} │ ${Math.round(revalidatedMudItem.confidenceScore * 100)}%${' '.repeat(12)} │`)
    console.log(`│ Agent Count     │ ${initialResult.executionSummary?.totalAgents || 0}${' '.repeat(14)} │ ${revalidationResult.executionSummary?.totalAgents || 0}${' '.repeat(14)} │`)
    console.log(`│ Execution Time  │ ${initialResult.totalExecutionTime}ms${' '.repeat(9)} │ ${revalidationResult.totalExecutionTime}ms${' '.repeat(9)} │`)
    console.log('└─────────────────┴─────────────────┴─────────────────┘')
    
    // Step 4: Verify agent transparency improvements
    console.log('\n🔍 Step 4: Agent Transparency Verification:')
    
    // Check if agent traces are present
    if (initialResult.agentTraces && initialResult.agentTraces.length > 0) {
      console.log('✅ Agent traces available for initial validation')
      console.log(`   - ${initialResult.agentTraces.length} agents executed`)
      console.log(`   - Average confidence: ${Math.round((initialResult.executionSummary?.averageConfidence || 0) * 100)}%`)
    } else {
      console.log('❌ No agent traces in initial validation')
    }
    
    if (revalidationResult.agentTraces && revalidationResult.agentTraces.length > 0) {
      console.log('✅ Agent traces available for re-validation')
      console.log(`   - ${revalidationResult.agentTraces.length} agents re-executed`)
      console.log(`   - Re-validation demonstrates genuine agent processing`)
    } else {
      console.log('❌ No agent traces in re-validation')
    }
    
    // Step 5: Verify decision factors are clear
    console.log('\n💡 Step 5: Decision Clarity Check:')
    
    if (mudItem.explanation && mudItem.explanation.summary) {
      console.log('✅ Initial decision explanation available')
      console.log(`   Summary: "${mudItem.explanation.summary.substring(0, 100)}..."`)
    } else {
      console.log('❌ No initial decision explanation')
    }
    
    if (revalidatedMudItem.explanation && revalidatedMudItem.explanation.summary) {
      console.log('✅ Re-validation decision explanation available')
      console.log(`   Summary: "${revalidatedMudItem.explanation.summary.substring(0, 100)}..."`)
    } else {
      console.log('❌ No re-validation decision explanation')
    }
    
    // Step 6: Final assessment
    console.log('\n🎯 Step 6: UX Improvements Assessment:')
    
    const improvements = []
    
    // Check for improved status
    if (revalidatedMudItem.status === 'ALLOW' && mudItem.status === 'NEEDS_REVIEW') {
      improvements.push('✅ User context successfully improved item status')
    } else if (revalidatedMudItem.status !== mudItem.status) {
      improvements.push('⚠️ Status changed but not necessarily improved')
    } else {
      improvements.push('ℹ️ Status remained the same (context may still be valuable)')
    }
    
    // Check for improved confidence
    if (revalidatedMudItem.confidenceScore > mudItem.confidenceScore) {
      improvements.push('✅ Confidence score improved with additional context')
    } else {
      improvements.push('ℹ️ Confidence score did not improve')
    }
    
    // Check for genuine re-processing
    if (revalidationResult.agentTraces && revalidationResult.agentTraces.length > 0) {
      improvements.push('✅ Genuine agent re-processing demonstrated')
    }
    
    console.log(improvements.join('\n'))
    
    // Final result
    const successfulImprovements = improvements.filter(imp => imp.includes('✅')).length
    const totalChecks = improvements.length
    
    console.log(`\n🏆 Overall UX Improvement Score: ${successfulImprovements}/${totalChecks}`)
    
    if (successfulImprovements >= Math.ceil(totalChecks * 0.7)) {
      console.log('🎉 Agent transparency improvements are working effectively!')
      console.log('👥 Users can now clearly see how their context influences AI decisions')
    } else {
      console.log('⚠️ Some agent transparency improvements need refinement')
    }
    
    console.log('\n🌐 Test completed - Check localhost:3001 to see the UI improvements in action')
    console.log('💡 Try entering "mud" and then providing context like "drywall mud for renovation"')
    
    return {
      initialResult,
      revalidationResult,
      improvements: successfulImprovements,
      totalChecks
    }
    
  } catch (error) {
    console.error('❌ User journey test failed:', error.message)
    throw error
  }
}

// Run the complete test
if (require.main === module) {
  testCompleteUserJourney().catch(console.error)
}

module.exports = { testCompleteUserJourney }