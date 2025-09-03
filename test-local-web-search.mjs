/**
 * Local testing script for enhanced Web Search agent
 */

import { classifyItem } from './lib/web-ingest/item-classifier.ts';

async function testLocalClassification() {
  console.log('🧪 Testing Enhanced Web Search Agent Locally\n');

  const testItems = [
    {
      itemName: 'DEWALT Cordless Drill 20V',
      vendor: 'Home Depot',
      sourceUrl: 'https://homedepot.com/dewalt-drill',
      price: 149.99,
      expected: 'equipment'
    },
    {
      itemName: '1/2 inch Copper Pipe Fitting',
      vendor: 'Grainger', 
      sourceUrl: 'https://grainger.com/copper-fitting',
      price: 3.25,
      expected: 'material'
    },
    {
      itemName: '12 AWG Electrical Wire',
      vendor: 'Grainger',
      sourceUrl: 'https://grainger.com/wire',
      expected: 'material'
    },
    {
      itemName: 'Stanley Measuring Tape 25ft',
      vendor: 'Home Depot',
      sourceUrl: 'https://homedepot.com/tape',
      expected: 'equipment'
    },
    {
      itemName: 'HVAC Air Filter MERV 8',
      vendor: 'Grainger',
      sourceUrl: 'https://grainger.com/filter',
      expected: 'material'
    }
  ];

  console.log('🔍 Classification Results:\n');

  let correctCount = 0;
  for (const item of testItems) {
    try {
      const result = await classifyItem(item);
      
      const isCorrect = result.kind === item.expected;
      const status = isCorrect ? '✅' : '❌';
      if (isCorrect) correctCount++;

      console.log(`${status} ${item.itemName}`);
      console.log(`   Expected: ${item.expected} | Got: ${result.kind}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Method: ${result.reasoning.includes('Rule-based') ? 'Rule-based' : 'GPT-5'}`);
      console.log(`   Reasoning: ${result.reasoning.substring(0, 80)}...`);
      console.log('');

    } catch (error) {
      console.log(`❌ ${item.itemName} - Error: ${error.message}`);
    }
  }

  console.log(`📊 Results: ${correctCount}/${testItems.length} correct classifications`);
  console.log(`🎯 Accuracy: ${(correctCount / testItems.length * 100).toFixed(1)}%\n`);
}

// Run the test
testLocalClassification().catch(console.error);