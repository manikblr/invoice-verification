/**
 * Item Classifier for Web Search Agent
 * Classifies web-ingested items as material or equipment using GPT-5
 */

import { createOpenRouterService } from '../llm/openrouter-service';

export interface ItemClassification {
  kind: 'material' | 'equipment';
  confidence: number;
  reasoning: string;
}

export interface ClassificationInput {
  itemName: string;
  itemDescription?: string;
  vendor: string;
  sourceUrl: string;
  price?: number;
  unitOfMeasure?: string;
  packQty?: number;
}

/**
 * Classify an item as material or equipment using GPT-5
 */
export async function classifyItem(input: ClassificationInput): Promise<ItemClassification> {
  try {
    const openRouterService = createOpenRouterService();
    
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

## CLASSIFICATION CRITERIA

1. **Usage Pattern**: Is it consumed/installed permanently (material) or used repeatedly (equipment)?
2. **Durability**: Single-use/consumable (material) vs. multi-use/durable (equipment)?
3. **Function**: Becomes part of the system (material) vs. performs work on systems (equipment)?

## VENDOR CONTEXT CONSIDERATIONS
- **Grainger**: Primarily industrial supplies - both materials and equipment
- **Home Depot**: Mix of construction materials and tools
- **Amazon Business**: Wide variety, check specific item characteristics

## RESPONSE FORMAT
Respond with valid JSON only:
{
  "kind": "material" | "equipment",
  "confidence": number (0.0-1.0),
  "reasoning": "Specific explanation of classification decision including usage pattern and durability factors"
}`;

    const userPrompt = `**ITEM TO CLASSIFY:**
- **Name:** "${input.itemName}"
${input.itemDescription ? `- **Description:** "${input.itemDescription}"` : '- **Description:** Not provided'}
- **Vendor:** ${input.vendor}
- **Source URL:** ${input.sourceUrl}
${input.price ? `- **Price:** $${input.price}` : ''}
${input.unitOfMeasure ? `- **Unit of Measure:** ${input.unitOfMeasure}` : ''}
${input.packQty ? `- **Pack Quantity:** ${input.packQty}` : ''}

**TASK:** Classify this item as either "material" (consumable) or "equipment" (durable tool/device). Consider the usage pattern, durability, and function to make your determination.

Provide your classification as JSON only.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    const response = await openRouterService.chatCompletion(messages, {
      temperature: 0.1,
      maxTokens: 300,
      model: process.env.OPENROUTER_PREVALIDATION_MODEL || 'openai/gpt-4o-2024-11-20'
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenRouter');
    }

    // Parse JSON response
    const result = JSON.parse(content.trim());
    
    // Validate response structure
    if (!result.kind || !['material', 'equipment'].includes(result.kind)) {
      throw new Error('Invalid classification result: missing or invalid kind');
    }

    return {
      kind: result.kind as 'material' | 'equipment',
      confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.5)),
      reasoning: String(result.reasoning || 'No reasoning provided')
    };

  } catch (error) {
    console.error('Item classification error:', error);
    
    // Fallback classification using rule-based heuristics
    return classifyItemFallback(input);
  }
}

/**
 * Fallback rule-based classification when GPT-5 is unavailable
 */
function classifyItemFallback(input: ClassificationInput): ItemClassification {
  const itemName = input.itemName.toLowerCase();
  
  // Equipment patterns (tools, machinery, instruments)
  const equipmentPatterns = [
    /drill|saw|grinder|sander|hammer|wrench|plier|screwdriver/i,
    /meter|gauge|level|tester|detector|scanner/i,
    /motor|pump|compressor|fan|blower|heater|cooler/i,
    /tool|device|instrument|machine|equipment/i,
    /light|fixture|lamp|flashlight/i,
    /hard hat|safety glass|helmet/i
  ];
  
  // Material patterns (consumables, parts, supplies)
  const materialPatterns = [
    /pipe|fitting|valve|gasket|seal|elbow|coupling/i,
    /wire|cable|conduit|outlet|switch|breaker/i,
    /filter|duct|thermostat|refrigerant/i,
    /screw|bolt|nut|washer|fastener|anchor/i,
    /adhesive|sealant|lubricant|cleaner|chemical/i,
    /glove|mask|tape|rope|chain|hose/i,
    /lumber|wood|concrete|insulation|drywall/i
  ];
  
  // Check equipment patterns first
  for (const pattern of equipmentPatterns) {
    if (pattern.test(itemName)) {
      return {
        kind: 'equipment',
        confidence: 0.7,
        reasoning: `Rule-based classification: Item name matches equipment pattern (${pattern.source})`
      };
    }
  }
  
  // Check material patterns
  for (const pattern of materialPatterns) {
    if (pattern.test(itemName)) {
      return {
        kind: 'material',
        confidence: 0.7,
        reasoning: `Rule-based classification: Item name matches material pattern (${pattern.source})`
      };
    }
  }
  
  // Default to material for unknown items (most FM items are consumables)
  return {
    kind: 'material',
    confidence: 0.5,
    reasoning: 'Rule-based classification: Default to material for ambiguous items'
  };
}

/**
 * Batch classify multiple items
 */
export async function classifyItems(inputs: ClassificationInput[]): Promise<ItemClassification[]> {
  const results: ItemClassification[] = [];
  
  // Process items sequentially to avoid rate limiting
  for (const input of inputs) {
    try {
      const classification = await classifyItem(input);
      results.push(classification);
      
      // Add small delay between classifications
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Failed to classify item ${input.itemName}:`, error);
      // Use fallback for failed items
      results.push(classifyItemFallback(input));
    }
  }
  
  return results;
}