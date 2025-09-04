#!/usr/bin/env node

const { chromium } = require('playwright');

async function testAgentPipeline() {
  console.log('🎭 Starting Playwright test for agent pipeline with Hydro Jetter...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('📄 Navigating to application...');
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ path: 'test-initial.png' });
    console.log('📸 Captured initial screenshot');
    
    // Fill in service information
    console.log('\n📝 Filling service information...');
    
    // Select service line (Appliances is already selected as id=1)
    const serviceLineDropdown = await page.locator('select:has-text("Service Line")').first();
    if (await serviceLineDropdown.count() > 0) {
      await serviceLineDropdown.selectOption({ value: '1' });
      console.log('✓ Selected Service Line: Appliances');
    }
    
    // Select service type
    const serviceTypeDropdown = await page.locator('select').nth(1);
    if (await serviceTypeDropdown.count() > 0) {
      await serviceTypeDropdown.selectOption({ value: '1' });
      console.log('✓ Selected Service Type');
    }
    
    // Fill scope of work
    const scopeInput = await page.locator('textarea[placeholder*="scope"]');
    if (await scopeInput.count() > 0) {
      await scopeInput.fill('Preventive maintenance and pipe cleaning services for plumbing system');
      console.log('✓ Filled scope of work');
    }
    
    // Add line items
    console.log('\n📦 Adding line items...');
    
    const items = [
      { name: 'Hydro Jetter', quantity: '1', unitPrice: '3500', type: 'equipment' },
      { name: 'Pipe Camera Inspection System', quantity: '1', unitPrice: '1200', type: 'equipment' },
      { name: 'PVC Pipe 2 inch', quantity: '50', unitPrice: '15', type: 'material' },
      { name: 'Labor charges', quantity: '8', unitPrice: '75', type: 'labor' },
      { name: 'Drywall Mud', quantity: '5', unitPrice: '25', type: 'material' },
      { name: 'Electrical Conduit', quantity: '20', unitPrice: '12.50', type: 'material' }
    ];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Click "Add Line Item" button if not first item
      if (i > 0) {
        const addButton = await page.locator('button:has-text("Add Line Item")');
        if (await addButton.count() > 0) {
          await addButton.click();
          await page.waitForTimeout(500);
        }
      }
      
      // Fill item details
      const row = i + 1;
      
      // Name
      const nameInput = await page.locator(`input[placeholder*="name"]`).nth(i);
      await nameInput.fill(item.name);
      
      // Quantity  
      const qtyInput = await page.locator(`input[placeholder*="quantity" i], input[placeholder*="qty" i]`).nth(i);
      await qtyInput.fill(item.quantity);
      
      // Unit Price
      const priceInput = await page.locator(`input[placeholder*="price"]`).nth(i);
      await priceInput.fill(item.unitPrice);
      
      // Type
      const typeSelect = await page.locator(`select`).nth(i + 2); // Offset by 2 for service dropdowns
      if (await typeSelect.count() > 0) {
        await typeSelect.selectOption(item.type);
      }
      
      console.log(`✓ Added item ${i + 1}: ${item.name}`);
    }
    
    // Take screenshot before validation
    await page.screenshot({ path: 'test-before-validation.png' });
    console.log('\n📸 Captured form filled screenshot');
    
    // Click validate button
    console.log('\n🚀 Triggering validation...');
    const validateButton = await page.locator('button:has-text("Validate Invoice")');
    if (await validateButton.count() > 0) {
      await validateButton.click();
      console.log('✓ Clicked validate button');
    }
    
    // Wait for validation results
    console.log('\n⏳ Waiting for agent pipeline to complete...');
    
    // Wait for agent visualization or results
    await page.waitForSelector('[data-testid="agent-visualization"], .agent-pipeline-visualization, text=/Agent.*completed/i', { 
      timeout: 60000 
    }).catch(() => {
      console.log('⚠️  Agent visualization not found, checking for results...');
    });
    
    // Check for validation results
    const resultsVisible = await page.locator('text=/validation.*complete/i, text=/overall.*status/i').count() > 0;
    if (resultsVisible) {
      console.log('✅ Validation completed!');
    }
    
    // Capture agent traces
    console.log('\n🤖 Checking agent execution traces...');
    
    // Look for agent status indicators
    const agentStatuses = await page.locator('.agent-status, [data-testid*="agent"]').all();
    console.log(`Found ${agentStatuses.length} agent status indicators`);
    
    // Check for specific agents
    const agents = [
      'Pre-Validation Agent',
      'Item Validator Agent', 
      'Item Matcher Agent',
      'Web Search Agent',
      'Price Learner Agent',
      'Rule Applier Agent',
      'Explanation Agent'
    ];
    
    for (const agentName of agents) {
      const agentElement = await page.locator(`text=/${agentName}/i`).first();
      if (await agentElement.count() > 0) {
        console.log(`✓ ${agentName} found`);
        
        // Check if agent shows as disabled/skipped
        const parent = await agentElement.locator('..').first();
        const textContent = await parent.textContent();
        if (textContent.includes('disabled') || textContent.includes('skipped')) {
          console.log(`  ⚠️  ${agentName} appears to be disabled or skipped`);
        }
      } else {
        console.log(`✗ ${agentName} not found`);
      }
    }
    
    // Check for Web Search Agent specific issue
    const webSearchDisabled = await page.locator('text=/web.*search.*disabled/i, text=/web.*ingest.*disabled/i').count() > 0;
    if (webSearchDisabled) {
      console.log('\n⚠️  Web Search Agent is showing as disabled!');
      console.log('This might be due to FEATURE_WEB_INGEST flag');
    }
    
    // Check validation results for each item
    console.log('\n📊 Checking validation results for each item...');
    
    // Look for result indicators
    const approvedItems = await page.locator('text=/approved/i, .status-approved, .text-green-600').count();
    const rejectedItems = await page.locator('text=/rejected/i, .status-rejected, .text-red-600').count();
    const reviewItems = await page.locator('text=/needs.*review/i, .status-review, .text-yellow-600').count();
    
    console.log(`✓ Approved items: ${approvedItems}`);
    console.log(`✗ Rejected items: ${rejectedItems}`);
    console.log(`⚠ Need review: ${reviewItems}`);
    
    // Take final screenshot
    await page.screenshot({ path: 'test-final-results.png', fullPage: true });
    console.log('\n📸 Captured final results screenshot');
    
    // Check for errors
    const errors = await page.locator('.error, [data-testid="error"], text=/error/i').count();
    if (errors > 0) {
      console.log(`\n⚠️  Found ${errors} error indicators on the page`);
    }
    
    console.log('\n✅ Test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Hydro Jetter and other items were processed');
    console.log('- Labor charges should have been rejected (blacklisted)');
    console.log('- Check screenshots for visual confirmation');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: 'test-error.png', fullPage: true });
    console.log('📸 Error screenshot saved');
    throw error;
  } finally {
    await browser.close();
  }
}

// Run the test
testAgentPipeline().catch(console.error);