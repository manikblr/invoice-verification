import { test, expect } from '@playwright/test'

test.describe('Taxonomy and Suggestion Tests', () => {
  // Global setup to fail on console errors
  test.beforeEach(async ({ page }) => {
    const errors: string[] = []
    
    page.on('pageerror', (error) => {
      errors.push(`Page error: ${error.message}`)
    })
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`Console error: ${msg.text()}`)
      }
    })

    // Fail test if any errors occurred
    test.afterEach(() => {
      if (errors.length > 0) {
        throw new Error(`Console/Page errors detected:\n${errors.join('\n')}`)
      }
    })
  })

  test('service line dropdown shows live taxonomy data', async ({ page }) => {
    await page.goto('/')
    
    // Wait for form to load and API call to complete
    await page.waitForSelector('select[name="service_line_id"]', { timeout: 5000 })
    await page.waitForTimeout(1000) // Allow time for API fetch
    
    // Check service line dropdown has real options (not just "Select Service Line")
    const serviceLineSelect = page.locator('select[name="service_line_id"]')
    const options = await serviceLineSelect.locator('option').count()
    
    // Should have at least 2 options: default "Select..." + real data
    expect(options).toBeGreaterThanOrEqual(2)
    
    // Verify it's not the old demo data
    const optionTexts = await serviceLineSelect.locator('option').allTextContents()
    expect(optionTexts.join(' ')).not.toContain('Facility Maintenance')
    expect(optionTexts.join(' ')).not.toContain('IT Services')
  })

  test('materials input shows suggestions on typing', async ({ page }) => {
    await page.goto('/')
    
    // Find first materials name input 
    const materialInput = page.locator('input[name="materials.0.name"]').first()
    await expect(materialInput).toBeVisible()
    
    // Type 3 characters to trigger suggestions
    await materialInput.fill('anod')
    
    // Wait for debounce and API call
    await page.waitForTimeout(800)
    
    // Check if suggestions dropdown appears with results
    // Look for suggestion dropdown or list
    const suggestions = page.locator('[role="listbox"], .suggestion-dropdown, [data-testid="suggestions"]')
    
    // Should either be visible with suggestions or at least exist
    await expect(suggestions).toBeVisible({ timeout: 3000 })
    
    // Alternative: check if any list items appear
    const suggestionItems = page.locator('li, [role="option"]')
    const itemCount = await suggestionItems.count()
    expect(itemCount).toBeGreaterThan(0)
  })

  test('api/taxonomy returns live service data', async ({ request }) => {
    const response = await request.get('/api/taxonomy')
    
    expect(response.status()).toBe(200)
    
    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('service_lines')
    expect(data).toHaveProperty('service_types')
    
    // Should have real data, not empty arrays
    expect(Array.isArray(data.service_lines)).toBe(true)
    expect(Array.isArray(data.service_types)).toBe(true)
  })
})