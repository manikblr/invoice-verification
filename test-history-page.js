const { chromium } = require('playwright');

async function testHistoryPage() {
  console.log('🎭 Testing history page functionality...');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to history page
    console.log('📱 Navigating to history page...');
    await page.goto('http://localhost:3000/history');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of initial state
    await page.screenshot({ path: 'history-initial.png' });
    console.log('📸 Initial history page screenshot saved');
    
    // Check if page loads without errors
    const hasError = await page.$('text=Failed to load');
    if (hasError) {
      console.log('❌ History page has loading error');
      await page.screenshot({ path: 'history-error.png' });
    } else {
      console.log('✅ History page loaded successfully');
    }
    
    // Check for validation history entries
    const historyEntries = await page.$$('tbody tr');
    console.log(`📋 Found ${historyEntries.length} history entries`);
    
    if (historyEntries.length > 0) {
      // Test clicking on "View Details" button
      console.log('🔍 Testing View Details button...');
      const detailsLink = await page.$('text=View Details');
      if (detailsLink) {
        const href = await detailsLink.getAttribute('href');
        console.log('📍 Details link href:', href);
        
        await detailsLink.click();
        await page.waitForTimeout(3000);
        
        // Check if details page loads
        const currentUrl = page.url();
        console.log('📍 Current URL after click:', currentUrl);
        
        if (currentUrl.includes('/history/')) {
          console.log('✅ Details page navigation successful');
          
          // Check for action buttons
          const agentTraceButton = await page.$('text=View Agent Trace');
          const exportButton = await page.$('text=Export PDF');
          const copyButton = await page.$('text=Copy ID');
          
          console.log('🔍 Agent Trace button:', agentTraceButton ? '✅ Found' : '❌ Missing');
          console.log('📄 Export PDF button:', exportButton ? '✅ Found' : '❌ Missing');
          console.log('📋 Copy ID button:', copyButton ? '✅ Found' : '❌ Missing');
          
          // Test Agent Trace button
          if (agentTraceButton) {
            console.log('🤖 Testing Agent Trace button...');
            await agentTraceButton.click();
            await page.waitForTimeout(3000);
            
            const traceUrl = page.url();
            console.log('📍 Trace URL:', traceUrl);
            
            if (traceUrl.includes('/trace')) {
              console.log('✅ Agent trace page loaded');
              
              // Check if AgentPipelineVisualization component is present
              const agentTable = await page.$('text=Agent Execution Details');
              if (agentTable) {
                console.log('✅ Agent execution table found');
                
                // Try to hover on prompt cell to test our recent fix
                const promptCells = await page.$$('td div.cursor-help');
                if (promptCells.length > 0) {
                  console.log('🖱️ Testing hover on agent trace page...');
                  await promptCells[0].hover();
                  await page.waitForTimeout(1000);
                  
                  const tooltip = await page.$('div.fixed.z-\\[10000\\]');
                  console.log('💬 Tooltip on trace page:', tooltip ? '✅ Working' : '❌ Not working');
                }
              } else {
                console.log('❌ Agent execution table not found');
              }
            } else {
              console.log('❌ Agent trace page failed to load');
            }
          }
          
          await page.screenshot({ path: 'history-trace-test.png' });
          console.log('📸 Trace page screenshot saved');
          
        } else {
          console.log('❌ Details page navigation failed');
        }
        
    } else {
      console.log('❌ No View Details button found');
    }
    
    await page.screenshot({ path: 'history-final.png' });
    console.log('📸 Final screenshot saved');
    
    } else {
      console.log('ℹ️ No history entries found - this is expected for a fresh system');
    }
    
    await page.waitForTimeout(2000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: 'history-test-error.png' });
  } finally {
    console.log('🎭 History test complete');
    await browser.close();
  }
}

testHistoryPage();