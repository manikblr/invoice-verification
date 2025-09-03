// Test script to verify form validation
const puppeteer = require('puppeteer');

async function testFormValidation() {
  console.log('Testing form validation for mandatory fields...');
  
  const browser = await puppeteer.launch({ 
    headless: false,
    devtools: true 
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to the application
    await page.goto('http://localhost:3000');
    await page.waitForSelector('form');
    
    console.log('Page loaded successfully');
    
    // Fill in only scope and an item (not service fields)
    await page.type('input[name="scope_of_work"]', 'Test scope');
    
    // Try to find and fill the first item name field
    const itemNameField = await page.$('input[placeholder*="Search materials"]');
    if (itemNameField) {
      await itemNameField.type('Test Item');
    }
    
    // Try to submit the form without selecting service line/type
    console.log('Attempting to submit form without service fields...');
    const submitButton = await page.$('button[type="submit"]');
    await submitButton.click();
    
    // Wait a bit to see if validation triggers
    await page.waitForTimeout(1000);
    
    // Check if any error messages appeared
    const errors = await page.$$eval('.text-red-600', elements => 
      elements.map(el => el.textContent)
    );
    
    if (errors.length > 0) {
      console.log('✅ Validation working! Error messages found:', errors);
    } else {
      // Check if an alert appeared
      page.on('dialog', async dialog => {
        console.log('✅ Alert triggered:', dialog.message());
        await dialog.accept();
      });
      
      // Check if form was prevented from submitting
      const isSubmitting = await page.$eval('button[type="submit"]', 
        button => button.textContent.includes('Validating')
      );
      
      if (!isSubmitting) {
        console.log('✅ Form submission was prevented');
      } else {
        console.log('❌ Form submitted despite missing required fields');
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the test
testFormValidation();