/**
 * Demo script for enhanced Web Search agent with material/equipment classification
 */

const { classifyItem } = require('./lib/web-ingest/item-classifier.ts');

async function demonstrateClassification() {
  console.log('🔍 Enhanced Web Search Agent - Material/Equipment Classification Demo\n');
  
  const testItems = [
    {
      itemName: 'DEWALT 20V MAX Cordless Drill',
      itemDescription: 'Brushless cordless drill with battery and charger',
      vendor: 'Home Depot',
      sourceUrl: 'https://homedepot.com/dewalt-drill',
      price: 149.99,
      unitOfMeasure: 'each',
      expected: 'equipment'
    },
    {
      itemName: '1/2" Copper Pipe Elbow Fitting',
      vendor: 'Grainger', 
      sourceUrl: 'https://grainger.com/copper-fitting',
      price: 3.25,
      unitOfMeasure: 'each',
      packQty: 10,
      expected: 'material'
    },
    {
      itemName: '12 AWG Electrical Wire 100ft',
      vendor: 'Grainger',
      sourceUrl: 'https://grainger.com/electrical-wire',
      expected: 'material'
    },
    {
      itemName: 'Stanley 25ft Measuring Tape',
      vendor: 'Home Depot',
      sourceUrl: 'https://homedepot.com/measuring-tape',
      expected: 'equipment'
    }
  ];

  console.log('Testing classification for various FM items...\n');

  for (const item of testItems) {
    try {
      console.log(`📦 Item: ${item.itemName}`);
      console.log(`   Vendor: ${item.vendor}`);
      console.log(`   Expected: ${item.expected}`);
      
      const result = await classifyItem(item);
      
      const status = result.kind === item.expected ? '✅' : '❌';
      console.log(`   ${status} Classified as: ${result.kind}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Reasoning: ${result.reasoning}\n`);
      
    } catch (error) {
      console.error(`❌ Error classifying ${item.itemName}:`, error.message);
    }
  }

  console.log('🚀 Enhanced Web Search Agent Features:');
  console.log('   ✓ GPT-5 material/equipment classification');
  console.log('   ✓ Rule-based fallback when GPT-5 unavailable');
  console.log('   ✓ Automatic canonical item creation');
  console.log('   ✓ Intelligent tag generation');
  console.log('   ✓ Integration with existing web scraping pipeline');
  console.log('   ✓ Material vs Equipment distinction for better agent workflows\n');
}

// Run the demo
if (require.main === module) {
  demonstrateClassification().catch(console.error);
}

module.exports = { demonstrateClassification };