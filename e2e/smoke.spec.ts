import { test, expect } from '@playwright/test'

test.describe('Invoice Verification Smoke Tests', () => {
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

  test('home page renders and contains Invoice Verification', async ({ page }) => {
    await page.goto('/')
    
    // Check 200 status (page loads)
    await expect(page).toHaveURL('/')
    
    // Check content
    await expect(page.locator('h1')).toContainText('Invoice Verification')
    await expect(page.getByRole('link', { name: 'Go to Verification' })).toBeVisible()
  })

  test('verify page renders with Run Verification button', async ({ page }) => {
    await page.goto('/verify')
    
    // Check 200 status (no 404)
    await expect(page).toHaveURL('/verify')
    
    // Check key elements
    await expect(page.locator('h1')).toContainText('Invoice Verification')
    await expect(page.getByRole('button', { name: /verification/i })).toBeVisible()
  })

  test('api/meta returns valid business metadata JSON', async ({ request }) => {
    const response = await request.get('/api/meta')
    
    // Check 200 status
    expect(response.status()).toBe(200)
    
    // Check JSON structure
    const data = await response.json()
    expect(data).toHaveProperty('ok', true)
    expect(data).toHaveProperty('service_lines')
    expect(data).toHaveProperty('service_types')
    expect(Array.isArray(data.service_lines)).toBe(true)
    expect(Array.isArray(data.service_types)).toBe(true)
  })
})