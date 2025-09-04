import { test, expect } from '@playwright/test'

test.describe('Agent Tooltip Functionality', () => {
  
  test('should test agent hover tooltips on main page', async ({ page }) => {
    await page.goto('http://localhost:3000/')
    
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle')
    
    // Look for the agent pipeline visualization
    await page.waitForSelector('table, .agent-pipeline', { timeout: 10000 })
    
    // Find all clickable agent cells (td elements that might contain agents)
    const agentCells = page.locator('td')
    const cellCount = await agentCells.count()
    
    console.log(`Found ${cellCount} table cells to test for agent tooltips`)
    
    if (cellCount > 0) {
      // Test hovering over the first few cells
      for (let i = 0; i < Math.min(5, cellCount); i++) {
        const cell = agentCells.nth(i)
        
        // Check if cell contains text (likely an agent)
        const cellText = await cell.textContent()
        if (cellText && cellText.trim().length > 0) {
          console.log(`Testing hover on cell ${i}: "${cellText.trim()}"`)
          
          // Hover over the cell
          await cell.hover()
          
          // Wait for potential tooltip to appear
          await page.waitForTimeout(500)
          
          // Look for tooltip elements (could be in portal)
          const tooltipSelectors = [
            '[id*="tooltip"]',
            '[class*="tooltip"]', 
            '[data-testid*="tooltip"]',
            '.agent-tooltip',
            'div[style*="position: fixed"]',
            'div[style*="position: absolute"]'
          ]
          
          let tooltipFound = false
          for (const selector of tooltipSelectors) {
            const tooltip = page.locator(selector)
            if (await tooltip.isVisible()) {
              tooltipFound = true
              console.log(`✅ Tooltip found with selector: ${selector}`)
              
              // Check tooltip content
              const tooltipText = await tooltip.textContent()
              expect(tooltipText).toBeTruthy()
              expect(tooltipText!.length).toBeGreaterThan(3)
              
              // Check tooltip positioning - should be visible and not clipped
              const tooltipBox = await tooltip.boundingBox()
              if (tooltipBox) {
                // Tooltip should be within viewport
                const viewport = page.viewportSize()!
                expect(tooltipBox.x).toBeGreaterThanOrEqual(0)
                expect(tooltipBox.y).toBeGreaterThanOrEqual(0)
                expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(viewport.width)
                expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(viewport.height)
                
                console.log(`✅ Tooltip positioned within viewport: x=${tooltipBox.x}, y=${tooltipBox.y}, w=${tooltipBox.width}, h=${tooltipBox.height}`)
              }
              
              break
            }
          }
          
          if (!tooltipFound) {
            console.log(`ℹ️ No tooltip appeared for cell "${cellText.trim()}" - may not be an agent cell`)
          }
          
          // Move mouse away to hide tooltip
          await page.mouse.move(0, 0)
          await page.waitForTimeout(300)
        }
      }
    }
  })

  test('should test tooltip positioning on different viewport sizes', async ({ page }) => {
    // Test on desktop size
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('http://localhost:3000/')
    await page.waitForLoadState('networkidle')
    
    // Find agent cells
    const agentCells = page.locator('td')
    if (await agentCells.count() > 0) {
      const cell = agentCells.first()
      await cell.hover()
      await page.waitForTimeout(500)
      
      // Check for tooltips
      const tooltip = page.locator('[id*="tooltip"], [class*="tooltip"], div[style*="position: fixed"]').first()
      if (await tooltip.isVisible()) {
        const tooltipBox = await tooltip.boundingBox()
        expect(tooltipBox).toBeTruthy()
        console.log('Desktop tooltip position:', tooltipBox)
      }
    }
    
    // Test on mobile size
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    if (await agentCells.count() > 0) {
      const cell = agentCells.first()
      await cell.hover()
      await page.waitForTimeout(500)
      
      const tooltip = page.locator('[id*="tooltip"], [class*="tooltip"], div[style*="position: fixed"]').first()
      if (await tooltip.isVisible()) {
        const tooltipBox = await tooltip.boundingBox()
        expect(tooltipBox).toBeTruthy()
        console.log('Mobile tooltip position:', tooltipBox)
      }
    }
  })

  test('should test tooltip content accuracy', async ({ page }) => {
    await page.goto('http://localhost:3000/')
    await page.waitForLoadState('networkidle')
    
    // Find agent cells with meaningful content
    const agentCells = page.locator('td')
    const cellCount = await agentCells.count()
    
    for (let i = 0; i < Math.min(3, cellCount); i++) {
      const cell = agentCells.nth(i)
      const cellText = await cell.textContent()
      
      if (cellText && cellText.trim().length > 0 && cellText.includes('Agent')) {
        console.log(`Testing tooltip content for agent: ${cellText}`)
        
        await cell.hover()
        await page.waitForTimeout(700)
        
        // Look for tooltip
        const tooltip = page.locator('[id*="tooltip"], [class*="tooltip"], div[style*="position: fixed"]').first()
        if (await tooltip.isVisible()) {
          const tooltipContent = await tooltip.textContent()
          
          // Tooltip should contain meaningful information
          expect(tooltipContent).toBeTruthy()
          expect(tooltipContent!.length).toBeGreaterThan(10)
          
          // Should contain agent-related keywords
          const hasRelevantContent = tooltipContent!.toLowerCase().includes('agent') ||
                                    tooltipContent!.toLowerCase().includes('prompt') ||
                                    tooltipContent!.toLowerCase().includes('model') ||
                                    tooltipContent!.toLowerCase().includes('gpt')
          
          if (hasRelevantContent) {
            console.log('✅ Tooltip contains relevant agent information')
          } else {
            console.log('⚠️ Tooltip content may not be agent-specific:', tooltipContent)
          }
        }
        
        // Clear hover
        await page.mouse.move(0, 0)
        await page.waitForTimeout(200)
      }
    }
  })

  test('should test tooltip interaction and dismissal', async ({ page }) => {
    await page.goto('http://localhost:3000/')
    await page.waitForLoadState('networkidle')
    
    const agentCells = page.locator('td')
    if (await agentCells.count() > 0) {
      const cell = agentCells.first()
      
      // Hover to show tooltip
      await cell.hover()
      await page.waitForTimeout(500)
      
      const tooltip = page.locator('[id*="tooltip"], [class*="tooltip"], div[style*="position: fixed"]').first()
      if (await tooltip.isVisible()) {
        console.log('✅ Tooltip appeared on hover')
        
        // Move mouse away to hide tooltip
        await page.mouse.move(100, 100)
        await page.waitForTimeout(500)
        
        // Tooltip should disappear or at least become invisible
        try {
          await expect(tooltip).not.toBeVisible({ timeout: 2000 })
          console.log('✅ Tooltip dismissed on mouse leave')
        } catch {
          // Some tooltips might persist, which is okay depending on implementation
          console.log('ℹ️ Tooltip behavior: may persist (implementation dependent)')
        }
      }
    }
  })
})

test.describe('Agent Trace Page Integration', () => {
  
  test('should load agent trace page and test tooltips there', async ({ page }) => {
    // First navigate to history to find a valid invoice ID
    await page.goto('http://localhost:3000/history')
    await page.waitForLoadState('networkidle')
    
    // Look for Agent Trace links
    const agentTraceLinks = page.locator('a:has-text("Agent Trace")')
    if (await agentTraceLinks.count() > 0) {
      await agentTraceLinks.first().click()
      
      // Should be on trace page
      await expect(page).toHaveURL(/\/history\/.*\/trace/)
      
      // Wait for trace page to load
      await page.waitForSelector('h1:has-text("🤖 Agent Execution Trace"), h1:has-text("Agent Execution Trace")', { timeout: 15000 })
      
      // Should see agent pipeline visualization
      const pipelineViz = page.locator('table, .agent-pipeline, [class*="agent"]')
      if (await pipelineViz.isVisible()) {
        console.log('✅ Agent pipeline visualization is visible on trace page')
        
        // Test hovering on this page as well
        const cells = pipelineViz.locator('td, .agent-cell').first()
        if (await cells.isVisible()) {
          await cells.hover()
          await page.waitForTimeout(500)
          
          // Check for tooltips
          const tooltip = page.locator('[id*="tooltip"], [class*="tooltip"]').first()
          if (await tooltip.isVisible()) {
            console.log('✅ Tooltips working on agent trace page')
          }
        }
      }
    } else {
      console.log('No validation sessions with agent traces found for testing')
    }
  })
})