import { test, expect } from '@playwright/test'

test.describe('Invoice Verification Smoke Tests', () => {
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

  test('api/health-meta returns app metadata with required keys', async ({ request }) => {
    const response = await request.get('/api/health-meta')
    
    // Check 200 status  
    expect(response.status()).toBe(200)
    
    // Check JSON structure
    const data = await response.json()
    expect(data).toHaveProperty('name')
    expect(data).toHaveProperty('env') 
    expect(data).toHaveProperty('version')
    expect(data).toHaveProperty('cron_enabled')
    expect(typeof data.cron_enabled).toBe('boolean')
  })
})