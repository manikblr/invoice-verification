#!/usr/bin/env node

/**
 * Test GPT-5 material/equipment classification directly
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Read environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '.env');

try {
  const envContent = readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n');
  
  for (const line of envLines) {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
} catch (error) {
  console.error('Could not load .env file:', error.message);
  process.exit(1);
}

/**
 * OpenRouter service for GPT-5
 */
class OpenRouterService {
  constructor(apiKey, baseUrl = 'https://openrouter.ai/api/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async chatCompletion(messages, options = {}) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost:3000',
        'X-Title': 'Invoice Verification System',
      },
      body: JSON.stringify({
        model: options.model || 'openai/gpt-4o-2024-11-20',
        messages,
        temperature: options.temperature || 0.1,
        max_tokens: options.maxTokens || 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }
}

/**
 * Test GPT-5 classification for various items
 */
async function testGPT5Classification() {
  console.log('🚀 TESTING GPT-5 MATERIAL/EQUIPMENT CLASSIFICATION');
  console.log('=================================================');
  
  const openRouterService = new OpenRouterService(process.env.OPENROUTER_API_KEY);
  
  const testItems = [
    {
      name: "Milwaukee M18 Impact Driver",
      description: "18V brushless impact driver with battery and charger",
      vendor: "home_depot",
      expectedType: "equipment"
    },
    {
      name: "PVC Pipe Coupling 1/2 inch",
      description: "Standard PVC pipe coupling for plumbing connections",
      vendor: "grainger", 
      expectedType: "material"
    },
    {
      name: "MERV 8 Air Filter 16x25x1",
      description: "Pleated air filter for HVAC systems",
      vendor: "home_depot",
      expectedType: "material"
    },
    {
      name: "Digital Multimeter Fluke 117",
      description: "True RMS digital multimeter for electrical testing",
      vendor: "grainger",
      expectedType: "equipment"
    }
  ];

  const systemPrompt = `You are an expert facilities management (FM) procurement analyst specializing in classifying items as either MATERIALS or EQUIPMENT.

## CLASSIFICATION DEFINITIONS

**MATERIALS** - Consumable items that are used up during work:
- Pipes, fittings, valves, gaskets, seals
- Electrical wire, conduits, outlets, switches, breakers
- HVAC filters, ductwork, refrigerants, thermostats  
- Screws, bolts, nuts, washers, fasteners
- Cleaning supplies, lubricants, adhesives, sealants
- Safety items consumed during use (gloves, masks, protective gear)
- Raw materials like lumber, concrete, insulation
- Consumable parts and components

**EQUIPMENT** - Durable items that are used repeatedly:
- Power tools (drills, saws, grinders, sanders)
- Hand tools (wrenches, hammers, screwdrivers, pliers)
- Measuring instruments (meters, gauges, levels)
- Safety equipment reused multiple times (hard hats, safety glasses)
- Machinery, motors, pumps, compressors
- Test equipment, diagnostic tools
- Lighting fixtures, fans, heaters
- Durable appliances and devices

## RESPONSE FORMAT
Respond with valid JSON only:
{
  "kind": "material" | "equipment",
  "confidence": number (0.0-1.0),
  "reasoning": "Specific explanation of classification decision including usage pattern and durability factors"
}`;

  let successCount = 0;
  let totalTests = testItems.length;

  for (const [index, item] of testItems.entries()) {
    console.log(`\\n📝 TEST ${index + 1}/${totalTests}: ${item.name}`);
    console.log(`   Expected: ${item.expectedType}`);
    
    try {
      const userPrompt = `**ITEM TO CLASSIFY:**
- **Name:** "${item.name}"
- **Description:** "${item.description}"
- **Vendor:** ${item.vendor}

**TASK:** Classify this item as either "material" (consumable) or "equipment" (durable tool/device). Consider the usage pattern, durability, and function.

Provide your classification as JSON only.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      console.log('   🔄 Calling GPT-5...');
      const response = await openRouterService.chatCompletion(messages, {
        temperature: 0.1,
        maxTokens: 300,
        model: process.env.OPENROUTER_PREVALIDATION_MODEL || 'openai/gpt-4o-2024-11-20'
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from GPT-5');
      }

      const result = JSON.parse(content.trim());
      
      console.log(`   ✅ GPT-5 Result: ${result.kind} (confidence: ${result.confidence})`);
      console.log(`   💭 Reasoning: ${result.reasoning}`);
      
      const isCorrect = result.kind === item.expectedType;
      console.log(`   ${isCorrect ? '🎯 CORRECT' : '❌ INCORRECT'} - Expected: ${item.expectedType}`);
      
      if (isCorrect) successCount++;
      
      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      console.log('   🔄 This would fall back to rule-based classification in production');
    }
  }

  console.log(`\\n📊 TEST RESULTS SUMMARY`);
  console.log(`=======================`);
  console.log(`✅ Successful classifications: ${successCount}/${totalTests}`);
  console.log(`📈 Success rate: ${Math.round((successCount/totalTests) * 100)}%`);
  console.log(`\\n🎯 GPT-5 material/equipment classification ${successCount >= totalTests * 0.75 ? 'WORKING WELL' : 'NEEDS IMPROVEMENT'}!`);
}

// Run the test
testGPT5Classification().catch(console.error);