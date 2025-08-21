import { test, expect } from '@playwright/test'

test.describe('Suggestion Flow Tests', () => {
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

  test('suggestion dropdown appears on typing in line item name', async ({ page }) => {
    await page.goto('/verify')
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Invoice Verification')
    
    // Find the first line item name input (should be in LineItemRow)
    const nameInput = page.locator('input[type="text"]').first()
    await expect(nameInput).toBeVisible()
    
    // Clear existing text and type to trigger suggestions
    await nameInput.clear()
    await nameInput.fill('off')
    
    // Wait a bit for debounce and API call
    await page.waitForTimeout(500)
    
    // Check if suggestions dropdown appears
    // (SuggestionDropdown should render when there are suggestions)
    const dropdown = page.locator('[role="listbox"], .suggestion-dropdown, [data-testid="suggestions"]')
    await expect(dropdown).toBeVisible({ timeout: 3000 })
  })

  test('api/suggest_items returns valid response', async ({ request }) => {
    const response = await request.get('/api/suggest_items?q=office')
    
    // Check 200 status
    expect(response.status()).toBe(200)
    
    // Check JSON structure
    const data = await response.json()
    expect(data).toHaveProperty('suggestions')
    expect(Array.isArray(data.suggestions)).toBe(true)
    
    // If suggestions exist, check structure
    if (data.suggestions.length > 0) {
      const suggestion = data.suggestions[0]
      expect(suggestion).toHaveProperty('id')
      expect(suggestion).toHaveProperty('name')
      expect(suggestion).toHaveProperty('score')
      expect(typeof suggestion.score).toBe('number')
    }
  })
})