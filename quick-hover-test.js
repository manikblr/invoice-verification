const { chromium } = require('playwright');

async function quickHoverTest() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000
  });
  
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:3000');
    
    // Fill minimal form
    await page.fill('input[placeholder="Describe the work to be done"]', 'testing hover');
    
    // Select options quickly
    const selects = await page.$$('select');
    if (selects[0]) await selects[0].selectOption({ index: 1 });
    await page.waitForTimeout(1000);
    if (selects[1]) await selects[1].selectOption({ index: 1 });
    
    // Add item and submit
    await page.fill('input[placeholder*="Search materials"]', 'hammer');
    await page.fill('input[placeholder="0.00"]', '50');
    await page.click('button:has-text("Validate Invoice")');
    
    // Wait for agent section
    await page.waitForSelector('text=Agent Pipeline Execution', { timeout: 30000 });
    
    // Find and hover on first agent
    const firstPromptCell = await page.$('td div.cursor-help');
    if (firstPromptCell) {
      console.log('🖱️ Hovering on first agent...');
      
      // Get cell and table positions
      const cellRect = await firstPromptCell.boundingBox();
      const table = await page.$('table');
      const tableRect = await table.boundingBox();
      
      console.log('📍 Cell position:', cellRect);
      console.log('📊 Table bounds:', tableRect);
      
      await firstPromptCell.hover();
      await page.waitForTimeout(2000);
      
      // Find tooltip
      const tooltip = await page.$('div.fixed.z-\\[10000\\]');
      if (tooltip) {
        const tooltipRect = await tooltip.boundingBox();
        console.log('💬 Tooltip position:', tooltipRect);
        
        // Check if tooltip is outside table bounds
        const outsideTable = 
          tooltipRect.x > tableRect.x + tableRect.width ||
          tooltipRect.x + tooltipRect.width < tableRect.x ||
          tooltipRect.y > tableRect.y + tableRect.height ||
          tooltipRect.y + tooltipRect.height < tableRect.y;
        
        console.log(outsideTable ? '✅ Tooltip is OUTSIDE table' : '❌ Tooltip overlaps table');
        
        // Check proximity to cell
        const distance = Math.sqrt(
          Math.pow(tooltipRect.x - cellRect.x, 2) + 
          Math.pow(tooltipRect.y - cellRect.y, 2)
        );
        console.log(`📏 Distance from cell: ${Math.round(distance)}px`);
        
        await page.screenshot({ path: 'hover-test-result.png' });
        console.log('📸 Screenshot saved');
        
        await page.waitForTimeout(3000); // Keep visible
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'hover-test-error.png' });
  } finally {
    await browser.close();
  }
}

quickHoverTest();