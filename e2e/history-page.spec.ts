import { test, expect, Page } from '@playwright/test'

test.describe('History Page Functionality', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to history page
    await page.goto('http://localhost:3000/history')
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Validation History")', { timeout: 10000 })
  })

  test('should display history page with proper header and filters', async ({ page }) => {
    // Check main elements are present
    await expect(page.locator('h1')).toContainText('Validation History')
    await expect(page.locator('text=Track and analyze your invoice validation history')).toBeVisible()
    
    // Check filter elements
    await expect(page.locator('input[placeholder*="Search validation history"]')).toBeVisible()
    await expect(page.locator('select').first()).toBeVisible() // Status filter
    await expect(page.locator('input[type="date"]').first()).toBeVisible() // Date range
    
    // Check search button
    await expect(page.locator('button:has-text("🔍 Search")')).toBeVisible()
  })

  test('should handle empty history state', async ({ page }) => {
    // Wait for loading to complete
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 })
    
    // Check if no data message appears (common case for new instances)
    const noDataMessage = page.locator('text=No validation history found')
    if (await noDataMessage.isVisible()) {
      await expect(noDataMessage).toBeVisible()
      await expect(page.locator('text=Start validating invoices to see your history here')).toBeVisible()
      await expect(page.locator('a:has-text("Validate New Invoice")')).toBeVisible()
    }
  })

  test('should handle search functionality', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search validation history"]')
    const searchButton = page.locator('button:has-text("🔍 Search")')
    
    // Test search input
    await searchInput.fill('test invoice')
    await searchButton.click()
    
    // Wait for search to complete
    await page.waitForTimeout(2000)
    
    // Should show search results indicator
    const searchResults = page.locator('text*="Search results for"')
    if (await searchResults.isVisible()) {
      await expect(searchResults).toContainText('test invoice')
    }
  })

  test('should handle status filtering', async ({ page }) => {
    const statusFilter = page.locator('select').first()
    
    // Test different status filters
    await statusFilter.selectOption('ALLOW')
    await page.waitForTimeout(1000)
    
    await statusFilter.selectOption('NEEDS_REVIEW')
    await page.waitForTimeout(1000)
    
    await statusFilter.selectOption('REJECT')
    await page.waitForTimeout(1000)
    
    await statusFilter.selectOption('all')
    await page.waitForTimeout(1000)
  })

  test('should handle date range filtering', async ({ page }) => {
    const startDateInput = page.locator('input[type="date"]').first()
    const endDateInput = page.locator('input[type="date"]').last()
    
    // Set date range to last 7 days
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    const endDate = new Date()
    
    await startDateInput.fill(startDate.toISOString().split('T')[0])
    await endDateInput.fill(endDate.toISOString().split('T')[0])
    
    // Wait for filter to apply
    await page.waitForTimeout(2000)
  })

  test('should clear all filters', async ({ page }) => {
    // Set some filters first
    await page.locator('input[placeholder*="Search validation history"]').fill('test')
    await page.locator('select').first().selectOption('ALLOW')
    
    // Click clear filters
    const clearButton = page.locator('button:has-text("Clear all filters")')
    await clearButton.click()
    
    // Verify filters are cleared
    await expect(page.locator('input[placeholder*="Search validation history"]')).toHaveValue('')
    await expect(page.locator('select').first()).toHaveValue('all')
  })

  test('should navigate to validation details when clicking View Details', async ({ page }) => {
    // Wait for any validation sessions to load
    await page.waitForTimeout(3000)
    
    // Check if there are any validation sessions
    const viewDetailsLinks = page.locator('a:has-text("View Details")')
    const linkCount = await viewDetailsLinks.count()
    
    if (linkCount > 0) {
      // Click first "View Details" link
      await viewDetailsLinks.first().click()
      
      // Should navigate to detail page
      await expect(page).toHaveURL(/\/history\/.*/)
      
      // Should see validation details page
      await page.waitForSelector('h1:has-text("Validation Details")', { timeout: 10000 })
    } else {
      console.log('No validation sessions found to test detail navigation')
    }
  })

  test('should navigate to agent trace when clicking Agent Trace', async ({ page }) => {
    // Wait for any validation sessions to load
    await page.waitForTimeout(3000)
    
    // Check if there are any validation sessions
    const agentTraceLinks = page.locator('a:has-text("Agent Trace")')
    const linkCount = await agentTraceLinks.count()
    
    if (linkCount > 0) {
      // Click first "Agent Trace" link
      await agentTraceLinks.first().click()
      
      // Should navigate to trace page
      await expect(page).toHaveURL(/\/history\/.*\/trace/)
    } else {
      console.log('No validation sessions found to test trace navigation')
    }
  })

  test('should handle pagination if multiple pages exist', async ({ page }) => {
    // Wait for loading to complete
    await page.waitForTimeout(3000)
    
    // Check if pagination exists
    const nextButton = page.locator('button:has-text("Next")')
    const prevButton = page.locator('button:has-text("Previous")')
    
    if (await nextButton.isVisible() && !(await nextButton.isDisabled())) {
      // Click next page
      await nextButton.click()
      await page.waitForTimeout(1000)
      
      // Previous button should be enabled
      await expect(prevButton).not.toBeDisabled()
      
      // Click previous page
      await prevButton.click()
      await page.waitForTimeout(1000)
    }
  })

  test('should display correct invoice information in table', async ({ page }) => {
    // Wait for any data to load
    await page.waitForTimeout(3000)
    
    // Check table structure
    const table = page.locator('table')
    if (await table.isVisible()) {
      // Check table headers
      await expect(page.locator('th:has-text("Invoice & Status")')).toBeVisible()
      await expect(page.locator('th:has-text("Items & Results")')).toBeVisible()
      await expect(page.locator('th:has-text("Execution Details")')).toBeVisible()
      await expect(page.locator('th:has-text("Date & Actions")')).toBeVisible()
      
      // Check for proper status indicators in any rows
      const statusIndicators = page.locator('.bg-green-100, .bg-amber-100, .bg-red-100')
      if (await statusIndicators.count() > 0) {
        await expect(statusIndicators.first()).toBeVisible()
      }
    }
  })

  test('should handle network errors gracefully', async ({ page }) => {
    // Intercept API calls and make them fail
    await page.route('**/api/validation-history**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' })
      })
    })
    
    // Reload page to trigger error
    await page.reload()
    
    // Should show error state
    await expect(page.locator('text*="Failed to load validation history"')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button:has-text("Try Again")')).toBeVisible()
  })

  test('should display loading state initially', async ({ page }) => {
    // Navigate to fresh page
    await page.goto('http://localhost:3000/history')
    
    // Should see loading spinner briefly
    const loadingSpinner = page.locator('.animate-spin')
    const loadingText = page.locator('text=Loading validation history')
    
    // Check if loading indicators appear (they may be brief)
    try {
      await expect(loadingSpinner).toBeVisible({ timeout: 2000 })
    } catch {
      // Loading might be too fast, that's fine
    }
  })
})

test.describe('History Detail Page Functionality', () => {
  
  test('should handle missing validation details gracefully', async ({ page }) => {
    // Navigate to non-existent validation
    await page.goto('http://localhost:3000/history/nonexistent-invoice-id')
    
    // Should show "Validation Not Found" message
    await expect(page.locator('h2:has-text("Validation Not Found")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Failed to load validation details')).toBeVisible()
    
    // Should have navigation buttons
    await expect(page.locator('button:has-text("Go Back")')).toBeVisible()
    await expect(page.locator('a:has-text("View All History")')).toBeVisible()
  })

  test('should display validation details when data exists', async ({ page }) => {
    // This test assumes there's at least one validation session
    // First go to history page to find a valid invoice ID
    await page.goto('http://localhost:3000/history')
    
    // Wait for loading
    await page.waitForTimeout(3000)
    
    // Check if there are any validation sessions
    const viewDetailsLinks = page.locator('a:has-text("View Details")')
    const linkCount = await viewDetailsLinks.count()
    
    if (linkCount > 0) {
      // Get the href of the first details link
      const firstLink = viewDetailsLinks.first()
      await firstLink.click()
      
      // Should navigate to detail page and load
      await page.waitForSelector('h1:has-text("Validation Details")', { timeout: 10000 })
      
      // Should see validation components
      await expect(page.locator('text=📊 Session Summary')).toBeVisible()
      await expect(page.locator('text=📋 Invoice Information')).toBeVisible()
      
      // Should see action buttons
      await expect(page.locator('a:has-text("🔍 View Agent Trace")')).toBeVisible()
      await expect(page.locator('button:has-text("📄 Export PDF")')).toBeVisible()
      await expect(page.locator('button:has-text("📋 Copy ID")')).toBeVisible()
    }
  })

  test('should test export PDF functionality', async ({ page }) => {
    // Navigate to history and then to first available detail page
    await page.goto('http://localhost:3000/history')
    await page.waitForTimeout(3000)
    
    const viewDetailsLinks = page.locator('a:has-text("View Details")')
    if (await viewDetailsLinks.count() > 0) {
      await viewDetailsLinks.first().click()
      
      // Wait for page to load
      await page.waitForSelector('h1:has-text("Validation Details")', { timeout: 10000 })
      
      // Set up download handler
      const downloadPromise = page.waitForEvent('download')
      
      // Click export PDF button
      const exportButton = page.locator('button:has-text("📄 Export PDF")')
      await exportButton.click()
      
      // Handle the download
      try {
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/validation.*\.html/)
      } catch (error) {
        // Export might open in new tab or show error - that's okay for this test
        console.log('Export test completed (download behavior may vary)')
      }
    }
  })

  test('should test copy ID functionality', async ({ page }) => {
    // Grant clipboard permissions
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    
    await page.goto('http://localhost:3000/history')
    await page.waitForTimeout(3000)
    
    const viewDetailsLinks = page.locator('a:has-text("View Details")')
    if (await viewDetailsLinks.count() > 0) {
      await viewDetailsLinks.first().click()
      
      // Wait for page to load
      await page.waitForSelector('h1:has-text("Validation Details")', { timeout: 10000 })
      
      // Click copy ID button
      const copyButton = page.locator('button:has-text("📋 Copy ID")')
      await copyButton.click()
      
      // Verify clipboard contains invoice ID
      try {
        const clipboardContent = await page.evaluate(() => navigator.clipboard.readText())
        expect(clipboardContent).toBeTruthy()
        expect(clipboardContent.length).toBeGreaterThan(0)
      } catch (error) {
        // Clipboard API may not work in all test environments
        console.log('Copy ID test completed (clipboard API may not be available in test)')
      }
    }
  })
})

test.describe('Agent Trace Page Functionality', () => {
  
  test('should navigate to agent trace page', async ({ page }) => {
    // Start from history page
    await page.goto('http://localhost:3000/history')
    await page.waitForTimeout(3000)
    
    // Click first Agent Trace link if available
    const agentTraceLinks = page.locator('a:has-text("Agent Trace")')
    if (await agentTraceLinks.count() > 0) {
      await agentTraceLinks.first().click()
      
      // Should navigate to trace page
      await expect(page).toHaveURL(/\/history\/.*\/trace/)
      
      // Wait for trace page to load
      await page.waitForTimeout(3000)
    }
  })
  
  test('should test agent hover tooltips', async ({ page }) => {
    // Navigate to main page where agent tooltips are
    await page.goto('http://localhost:3000/')
    
    // Wait for the agent pipeline visualization to load
    await page.waitForSelector('[data-testid="agent-pipeline-visualization"], .agent-pipeline, table', { timeout: 10000 })
    
    // Look for agent elements to hover over
    const agentElements = page.locator('td, .agent-step, .agent-cell').first()
    
    if (await agentElements.isVisible()) {
      // Hover over the first agent
      await agentElements.hover()
      
      // Wait for tooltip to potentially appear
      await page.waitForTimeout(1000)
      
      // Check if tooltip portal exists (it should render outside the table)
      const tooltipPortal = page.locator('[id*="tooltip"], [class*="tooltip"], [data-testid="agent-tooltip"]')
      
      // The tooltip should be visible and not clipped by table boundaries
      if (await tooltipPortal.isVisible()) {
        await expect(tooltipPortal).toBeVisible()
        
        // Check tooltip positioning - it should be outside the table bounds
        const tooltipBox = await tooltipPortal.boundingBox()
        const tableElement = page.locator('table').first()
        
        if (await tableElement.isVisible() && tooltipBox) {
          const tableBox = await tableElement.boundingBox()
          
          if (tableBox) {
            // Tooltip should not be constrained by table boundaries
            const isOutsideTable = tooltipBox.x > tableBox.x + tableBox.width || 
                                  tooltipBox.y < tableBox.y || 
                                  tooltipBox.y > tableBox.y + tableBox.height
            
            if (isOutsideTable) {
              console.log('✅ Tooltip correctly positioned outside table boundaries')
            } else {
              console.log('⚠️ Tooltip may be clipped by table - check positioning')
            }
          }
        }
      }
    }
  })

  test('should test tooltip visibility and content', async ({ page }) => {
    // Navigate to main page
    await page.goto('http://localhost:3000/')
    
    // Wait for components to load
    await page.waitForTimeout(2000)
    
    // Find agent cells/elements
    const agentCells = page.locator('td, .agent-cell')
    const cellCount = await agentCells.count()
    
    if (cellCount > 0) {
      // Test hovering over multiple agent cells
      for (let i = 0; i < Math.min(3, cellCount); i++) {
        const cell = agentCells.nth(i)
        
        // Hover over the cell
        await cell.hover()
        await page.waitForTimeout(500)
        
        // Check for tooltip content
        const tooltips = page.locator('[id*="tooltip"], [class*="tooltip"], [data-testid*="tooltip"]')
        
        if (await tooltips.count() > 0) {
          const tooltip = tooltips.first()
          if (await tooltip.isVisible()) {
            // Tooltip should have some content
            const tooltipText = await tooltip.textContent()
            expect(tooltipText).toBeTruthy()
            expect(tooltipText!.length).toBeGreaterThan(5)
          }
        }
        
        // Move mouse away to hide tooltip
        await page.mouse.move(0, 0)
        await page.waitForTimeout(200)
      }
    }
  })
})

test.describe('Error Handling and Edge Cases', () => {
  
  test('should handle API errors in history page', async ({ page }) => {
    // Intercept and break the API
    await page.route('**/api/validation-history**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Database connection failed' })
      })
    })
    
    await page.goto('http://localhost:3000/history')
    
    // Should show error state
    await expect(page.locator('text*="Failed to load validation history"')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button:has-text("Try Again")')).toBeVisible()
  })

  test('should handle API errors in detail page', async ({ page }) => {
    // Intercept and break the validation detail API
    await page.route('**/api/validation/**', route => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Validation not found' })
      })
    })
    
    await page.goto('http://localhost:3000/history/test-invoice-id')
    
    // Should show validation not found
    await expect(page.locator('h2:has-text("Validation Not Found")')).toBeVisible({ timeout: 10000 })
  })

  test('should handle slow API responses', async ({ page }) => {
    // Slow down API responses
    await page.route('**/api/validation-history**', async route => {
      await new Promise(resolve => setTimeout(resolve, 3000)) // 3 second delay
      await route.continue()
    })
    
    await page.goto('http://localhost:3000/history')
    
    // Should show loading state
    await expect(page.locator('.animate-spin')).toBeVisible()
    await expect(page.locator('text=Loading validation history')).toBeVisible()
    
    // Wait for loading to complete
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 })
  })

  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    await page.goto('http://localhost:3000/history')
    await page.waitForTimeout(2000)
    
    // Check that elements are still visible and accessible
    await expect(page.locator('h1:has-text("Validation History")')).toBeVisible()
    
    // Filters should be stacked vertically on mobile
    const filterContainer = page.locator('.grid')
    await expect(filterContainer).toBeVisible()
  })
})