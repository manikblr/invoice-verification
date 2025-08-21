/**
 * Simple test for vendor adapter
 */

async function testHomeDepot() {
  try {
    const { fetchVendorItems } = await import('./adapters/homedepot.js')
    
    console.log('🧪 Testing Home Depot adapter...')
    
    const items = await fetchVendorItems({
      vendor_id: 'homedepot',
      line: 'Plumbing',
      queries: ['pipe wrench'],
      limit: 3,
      qps: 0.2,
      timeoutMs: 10000
    })
    
    console.log(`✅ Got ${items.length} items:`)
    items.forEach(item => {
      console.log(`  - ${item.name} ${item.price ? `$${item.price}` : 'no price'} ${item.sku || 'no sku'}`)
    })
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

testHomeDepot()