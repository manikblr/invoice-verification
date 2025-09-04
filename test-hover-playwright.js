const { chromium } = require('playwright');

async function testHoverTooltip() {
  console.log('🎭 Starting Playwright hover test...');
  
  const browser = await chromium.launch({ 
    headless: false,  // Set to false to see the browser
    slowMo: 300      // Slow down actions to see what's happening
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to the app
    console.log('📱 Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Fill out the form to trigger validation
    console.log('📝 Filling out form...');
    await page.fill('input[placeholder="Describe the work to be done"]', 'Test work for hover testing');
    
    // Wait for service lines to load
    console.log('⏳ Waiting for service lines to load...');
    await page.waitForTimeout(1000);
    
    // Select service line
    console.log('📋 Selecting service line...');
    const serviceLine = await page.$('select:has(option:text("Appliances"))');
    if (serviceLine) {
      await serviceLine.selectOption('1'); // Try selecting by value
      console.log('✅ Service line selected');
    } else {
      // Try different approach
      const allSelects = await page.$$('select');
      if (allSelects[0]) {
        const options = await allSelects[0].$$eval('option', opts => opts.map(o => ({text: o.textContent, value: o.value})));
        console.log('Available service lines:', options);
        if (options.length > 1) {
          await allSelects[0].selectOption(options[1].value);
        }
      }
    }
    
    // Wait for service types to load
    await page.waitForTimeout(1500);
    
    // Select service type
    console.log('📋 Selecting service type...');
    const allSelects = await page.$$('select');
    if (allSelects[1]) {
      const typeOptions = await allSelects[1].$$eval('option', opts => opts.map(o => ({text: o.textContent, value: o.value})));
      console.log('Available service types:', typeOptions.slice(0, 3));
      if (typeOptions.length > 1) {
        await allSelects[1].selectOption(typeOptions[1].value);
        console.log('✅ Service type selected:', typeOptions[1].text);
      }
    }
    
    // Add an item
    console.log('➕ Adding test item...');
    const itemInput = await page.$('input[placeholder*="Search materials"]');
    if (itemInput) {
      await itemInput.fill('test item');
    }
    
    // Set price
    const priceInput = await page.$('input[placeholder="0.00"]');
    if (priceInput) {
      await priceInput.fill('100');
    }
    
    // Take screenshot before submission
    await page.screenshot({ path: 'form-filled.png' });
    console.log('📸 Form screenshot saved');
    
    // Submit form
    console.log('🔍 Submitting form for validation...');
    const submitButton = await page.$('button:has-text("Validate Invoice")');
    if (submitButton) {
      await submitButton.click();
    }
    
    // Wait for validation to complete (with longer timeout)
    console.log('⏳ Waiting for validation results...');
    try {
      await page.waitForSelector('text=Agent Pipeline Execution', { timeout: 45000 });
      console.log('✅ Validation completed!');
    } catch (e) {
      console.log('⚠️ Agent Pipeline section not found, looking for results...');
      // Check if there's an Enhanced Validation Results section instead
      const hasResults = await page.$('text=Enhanced Validation Results');
      if (hasResults) {
        console.log('✅ Found validation results');
      }
    }
    
    // Scroll to agent table if it exists
    const agentSection = await page.$('text=Agent Pipeline Execution');
    if (agentSection) {
      console.log('📜 Scrolling to agent table...');
      await agentSection.scrollIntoViewIfNeeded();
      
      // Find the first agent's prompt cell
      console.log('🔍 Finding agent prompt cells...');
      await page.waitForTimeout(1000);
      
      // Look for cells with hover capability
      const promptCells = await page.$$('td div.cursor-help');
      
      if (promptCells.length > 0) {
        console.log(`✅ Found ${promptCells.length} hoverable prompt cells`);
        
        // Test hovering on the first agent
        console.log('🖱️ Hovering on first agent prompt cell...');
        const firstCell = promptCells[0];
        
        // Get viewport size
        const viewport = page.viewportSize();
        console.log('📐 Viewport size:', viewport);
        
        // Get position before hover
        const boxBefore = await firstCell.boundingBox();
        console.log('📍 First cell position:', boxBefore);
        
        // Hover over the cell
        await firstCell.hover();
        console.log('⏳ Waiting for tooltip...');
        await page.waitForTimeout(1500); // Wait for tooltip to appear
        
        // Multiple strategies to find the tooltip
        let tooltip = await page.$('div.fixed.z-\\[10000\\]');
        if (!tooltip) {
          tooltip = await page.$('div[style*="z-index: 10000"]');
        }
        if (!tooltip) {
          // Look for any fixed positioned tooltip
          const fixedDivs = await page.$$('div.fixed');
          for (const div of fixedDivs) {
            const text = await div.textContent();
            if (text && text.includes('Full Prompt')) {
              tooltip = div;
              break;
            }
          }
        }
        
        if (tooltip) {
          console.log('✅ Tooltip appeared!');
          
          // Get tooltip position and size
          const tooltipBox = await tooltip.boundingBox();
          console.log('📐 Tooltip dimensions:', {
            x: Math.round(tooltipBox.x),
            y: Math.round(tooltipBox.y),
            width: Math.round(tooltipBox.width),
            height: Math.round(tooltipBox.height)
          });
          
          // Check if tooltip is fully visible in viewport
          const topClipped = tooltipBox.y < 0;
          const bottomClipped = tooltipBox.y + tooltipBox.height > viewport.height;
          const leftClipped = tooltipBox.x < 0;
          const rightClipped = tooltipBox.x + tooltipBox.width > viewport.width;
          
          const isFullyVisible = !topClipped && !bottomClipped && !leftClipped && !rightClipped;
          
          if (isFullyVisible) {
            console.log('✅ Tooltip is FULLY VISIBLE in viewport!');
          } else {
            console.log('❌ Tooltip is CLIPPED!');
            console.log('  - Top edge:', topClipped ? `❌ CLIPPED by ${Math.abs(tooltipBox.y)}px` : '✅ OK');
            console.log('  - Bottom edge:', bottomClipped ? `❌ CLIPPED by ${tooltipBox.y + tooltipBox.height - viewport.height}px` : '✅ OK');
            console.log('  - Left edge:', leftClipped ? `❌ CLIPPED by ${Math.abs(tooltipBox.x)}px` : '✅ OK');
            console.log('  - Right edge:', rightClipped ? `❌ CLIPPED by ${tooltipBox.x + tooltipBox.width - viewport.width}px` : '✅ OK');
          }
          
          // Take screenshot
          await page.screenshot({ 
            path: 'hover-tooltip-first.png',
            fullPage: false 
          });
          console.log('📸 Screenshot saved as hover-tooltip-first.png');
          
          // Get tooltip content
          const tooltipText = await tooltip.textContent();
          console.log('📝 Tooltip shows:', tooltipText.includes('Full Prompt') ? 'Full Prompt section ✅' : 'Unknown content ❌');
          
        } else {
          console.log('❌ Tooltip did not appear!');
          
          // Debug: look for all elements that might be tooltips
          const allDivs = await page.$$eval('div', divs => 
            divs.filter(d => {
              const style = window.getComputedStyle(d);
              return style.position === 'fixed' && style.zIndex === '10000';
            }).map(d => ({
              text: d.textContent?.substring(0, 50),
              className: d.className
            }))
          );
          console.log('Fixed elements found:', allDivs);
          
          await page.screenshot({ path: 'hover-no-tooltip.png' });
        }
        
        // Move mouse away to hide tooltip
        await page.mouse.move(0, 0);
        await page.waitForTimeout(500);
        
        // Test hovering on last agent if available
        if (promptCells.length > 1) {
          console.log('\n🖱️ Testing last agent hover...');
          const lastCell = promptCells[promptCells.length - 1];
          const lastBox = await lastCell.boundingBox();
          console.log('📍 Last cell position:', lastBox);
          
          await lastCell.hover();
          await page.waitForTimeout(1500);
          
          let tooltipLast = await page.$('div.fixed.z-\\[10000\\]');
          if (tooltipLast) {
            const tooltipBoxLast = await tooltipLast.boundingBox();
            console.log('📐 Last tooltip position:', {
              x: Math.round(tooltipBoxLast.x),
              y: Math.round(tooltipBoxLast.y),
              width: Math.round(tooltipBoxLast.width),
              height: Math.round(tooltipBoxLast.height)
            });
            
            const topClipped = tooltipBoxLast.y < 0;
            if (topClipped) {
              console.log('❌ Last tooltip also CLIPPED at top by', Math.abs(tooltipBoxLast.y), 'px');
            } else {
              console.log('✅ Last tooltip is not clipped at top');
            }
            
            await page.screenshot({ 
              path: 'hover-tooltip-last.png',
              fullPage: false 
            });
            console.log('📸 Screenshot saved as hover-tooltip-last.png');
          }
        }
        
      } else {
        console.log('❌ No hoverable prompt cells found!');
        await page.screenshot({ path: 'no-prompt-cells.png' });
      }
    } else {
      console.log('❌ Agent Pipeline Execution section not found');
      await page.screenshot({ path: 'no-agent-section.png' });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    // Take error screenshot
    await page.screenshot({ path: 'hover-error.png', fullPage: true });
    console.log('📸 Error screenshot saved as hover-error.png');
    
  } finally {
    console.log('\n🎭 Test complete. Browser will close in 3 seconds...');
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

// Run the test
testHoverTooltip().catch(console.error);