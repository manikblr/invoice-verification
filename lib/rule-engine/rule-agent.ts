/**
 * Enhanced Rule Agent with MATERIAL_INCONSISTENT_WITH_CONTEXT rule
 * Phase 5: Rule Agent + Explanation Loop
 */

import { createClient } from '@supabase/supabase-js';

// TODO: Replace with actual tracing when available
async function trace(name: string, data: any, traceId?: string): Promise<string> {
  console.log(`[Trace ${name}]`, data);
  return traceId || `trace_${Date.now()}`;
}

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export enum RuleDecision {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  NEEDS_EXPLANATION = 'NEEDS_EXPLANATION',
}

export interface RuleContext {
  lineItemId: string;
  itemName: string;
  itemDescription?: string;
  canonicalItemId?: string;
  unitPrice: number;
  quantity: number;
  matchConfidence?: number;
  priceIsValid?: boolean;
  vendorId?: string;
  projectContext?: string;
  invoiceMetadata?: Record<string, any>;
  
  // Enhanced service context fields (implementation.md requirement)
  serviceLine?: string;
  serviceType?: string;
  hoursOnSite?: number;
  workScopeText?: string;
  
  // User-provided additional context for re-validation
  additionalContext?: string;
}

export interface RuleResult {
  decision: RuleDecision;
  reasons: string[];
  policyCodes: string[];
  facts: Record<string, any>;
  confidence: number;
  needsExplanation?: boolean;
  explanationPrompt?: string;
}

export class EnhancedRuleAgent {
  private priceRangesCache?: Record<string, { minPrice: number; maxPrice: number }>;
  private contextKeywords = {
    office: ['office', 'desk', 'chair', 'computer', 'software', 'stationery'],
    construction: ['concrete', 'steel', 'rebar', 'lumber', 'cement', 'brick', 'pipe', 'fitting'],
    electrical: ['wire', 'cable', 'conduit', 'outlet', 'switch', 'breaker', 'transformer'],
    plumbing: ['pipe', 'fitting', 'valve', 'pump', 'drain', 'fixture', 'water', 'sewer'],
    hvac: ['air', 'heating', 'cooling', 'duct', 'fan', 'filter', 'thermostat', 'refrigerant'],
    medical: ['medical', 'surgical', 'hospital', 'healthcare', 'diagnostic', 'pharmaceutical'],
    automotive: ['car', 'truck', 'engine', 'brake', 'tire', 'fuel', 'transmission', 'battery'],
    catering: ['food', 'kitchen', 'restaurant', 'cooking', 'dining', 'catering', 'beverage'],
  };

  /**
   * Apply business rules to determine line item approval
   */
  async applyRules(context: RuleContext): Promise<RuleResult> {
    const startTime = Date.now();
    const { lineItemId, itemName, canonicalItemId, unitPrice, quantity, vendorId } = context;

    const traceId = await trace('rule_agent_v2_1', {
      line_item_id: lineItemId,
      canonical_item_id: canonicalItemId,
      unit_price: unitPrice,
      item_name: itemName.substring(0, 50),
      service_line: context.serviceLine,
      service_type: context.serviceType,
      hours_on_site: context.hoursOnSite,
      has_work_scope: !!context.workScopeText,
    });

    try {
      console.log(`[Rule Agent] Evaluating rules for line item ${lineItemId}: "${itemName}"`);

      const facts: Record<string, any> = {
        unitPrice,
        quantity,
        matchConfidence: context.matchConfidence || 0,
        itemName,
      };
      
      let decision = RuleDecision.ALLOW;
      let confidence = 1.0;
      const policyCodes: string[] = [];
      const reasons: string[] = [];

      // Rule 1: NO_CANONICAL_MATCH
      if (!canonicalItemId) {
        policyCodes.push('NO_CANONICAL_MATCH');
        decision = RuleDecision.NEEDS_EXPLANATION;
        confidence = 0.9;
        reasons.push('No matching catalog item found - please provide context for this item');
      } else {
        facts.canonicalItemId = canonicalItemId;

        // Get price band for validation
        const priceRange = await this.getPriceRange(canonicalItemId);
        
        if (!priceRange) {
          policyCodes.push('NO_PRICE_BAND');
          decision = RuleDecision.NEEDS_EXPLANATION;
          confidence = 0.8;
          reasons.push('No price reference data available - manual review required');
        } else {
          facts.priceRangeMin = priceRange.minPrice;
          facts.priceRangeMax = priceRange.maxPrice;

          // Rule 2: PRICE_EXCEEDS_MAX_150
          const maxAllowed = priceRange.maxPrice * 1.5;
          if (unitPrice > maxAllowed) {
            policyCodes.push('PRICE_EXCEEDS_MAX_150');
            facts.maxAllowed150 = maxAllowed;
            decision = RuleDecision.DENY;
            confidence = 0.95;
            reasons.push(`Price $${unitPrice} exceeds maximum allowed $${maxAllowed.toFixed(2)} (150% of range)`);
          }

          // Rule 3: PRICE_BELOW_MIN_50
          const minAllowed = priceRange.minPrice * 0.5;
          if (priceRange.minPrice > 0 && unitPrice < minAllowed) {
            policyCodes.push('PRICE_BELOW_MIN_50');
            facts.minAllowed50 = minAllowed;
            decision = RuleDecision.DENY;
            confidence = 0.95;
            reasons.push(`Price $${unitPrice} below minimum allowed $${minAllowed.toFixed(2)} (50% of range)`);
          }
        }
      }

      // Rule 4: Check if user provided additional context that resolves previous issues
      if (context.additionalContext && context.additionalContext.trim().length > 0) {
        facts.userProvidedContext = context.additionalContext;
        
        // If user provided context, give them the benefit of the doubt and upgrade to ALLOW
        // unless there are severe violations (like blacklisted terms or extreme price issues)
        if (decision !== RuleDecision.DENY && policyCodes.length <= 1) {
          decision = RuleDecision.ALLOW;
          confidence = Math.max(confidence, 0.85);
          reasons.push(`Approved based on user context: "${context.additionalContext.substring(0, 50)}${context.additionalContext.length > 50 ? '...' : ''}"`);
        } else if (decision === RuleDecision.NEEDS_EXPLANATION) {
          // Still needs explanation but acknowledge the context was provided
          reasons.push(`Context provided: "${context.additionalContext.substring(0, 50)}${context.additionalContext.length > 50 ? '...' : ''}" - additional review may be needed`);
        }
      } else {
        // NEW Rule 4: MATERIAL_INCONSISTENT_WITH_CONTEXT (only if no user context provided)
        const contextInconsistency = this.checkMaterialContextConsistency(context);
        if (contextInconsistency) {
          policyCodes.push('MATERIAL_INCONSISTENT_WITH_CONTEXT');
          facts.contextInconsistency = contextInconsistency;
          decision = RuleDecision.NEEDS_EXPLANATION;
          confidence = Math.min(confidence, 0.7);
          reasons.push(contextInconsistency.reason);
        }
      }

      // Rule 5: VENDOR_EXCLUSION (placeholder)
      if (vendorId && this.isVendorExcluded(vendorId)) {
        policyCodes.push('VENDOR_EXCLUDED_BY_RULE');
        decision = RuleDecision.DENY;
        confidence = 1.0;
        reasons.push('Vendor is excluded by business rules');
      }

      // Rule 6: SERVICE_CONTEXT_INCONSISTENT
      const serviceInconsistency = this.checkServiceSpecificInconsistency(context);
      if (serviceInconsistency) {
        policyCodes.push('SERVICE_CONTEXT_INCONSISTENT');
        facts.serviceInconsistency = serviceInconsistency;
        decision = RuleDecision.NEEDS_EXPLANATION;
        confidence = Math.min(confidence, serviceInconsistency.score);
        reasons.push(serviceInconsistency.reason);
      }

      // Rule 7: QUANTITY_OVER_LIMIT
      if (quantity > 1000) {
        policyCodes.push('QUANTITY_OVER_LIMIT');
        facts.quantityLimit = 1000;
        decision = RuleDecision.NEEDS_EXPLANATION;
        confidence = Math.min(confidence, 0.8);
        reasons.push(`Quantity ${quantity} exceeds normal limit - justification required`);
      }

      // Rule 8: BLACKLISTED_TERMS
      const blacklistedTerm = this.checkBlacklistedTerms(itemName);
      if (blacklistedTerm) {
        policyCodes.push('BLACKLISTED_ITEM');
        facts.blacklistedTerm = blacklistedTerm;
        decision = RuleDecision.DENY;
        confidence = 1.0;
        reasons.push(`Item contains blacklisted term: "${blacklistedTerm}"`);
      }

      // Log rule application with service context
      await this.logRuleEvent(lineItemId, {
        decision: decision,
        policy_codes: policyCodes,
        confidence,
        canonical_item_id: canonicalItemId,
        vendor_id: vendorId,
        service_line: context.serviceLine,
        service_type: context.serviceType,
        hours_on_site: context.hoursOnSite,
        has_work_scope: !!context.workScopeText,
        rule_engine_version: '2.1.0',
      });

      const result: RuleResult = {
        decision,
        reasons,
        policyCodes,
        facts,
        confidence,
        needsExplanation: decision === RuleDecision.NEEDS_EXPLANATION,
        explanationPrompt: decision === RuleDecision.NEEDS_EXPLANATION 
          ? this.generateExplanationPrompt(context, reasons)
          : undefined,
      };

      await trace('rule_agent_v1', {
        decision: result.decision,
        policy_codes_count: result.policyCodes.length,
        confidence: result.confidence,
        needs_explanation: result.needsExplanation,
        duration_ms: Date.now() - startTime,
      }, traceId);

      console.log(`[Rule Agent] Decision for ${lineItemId}: ${decision} (${result.policyCodes.length} rules applied)`);

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Rule Agent] Error applying rules to ${lineItemId}:`, error);

      await trace('rule_agent_v1', {
        error: errorMsg,
        duration_ms: Date.now() - startTime,
      }, traceId);

      // Return safe default
      return {
        decision: RuleDecision.NEEDS_EXPLANATION,
        reasons: ['Error occurred during rule evaluation - manual review required'],
        policyCodes: ['RULE_ENGINE_ERROR'],
        facts: { error: errorMsg },
        confidence: 0.1,
        needsExplanation: true,
        explanationPrompt: 'Please provide additional context for this item due to processing error.',
      };
    }
  }

  /**
   * Enhanced: Check for material consistency with service context
   * Now considers service_line, service_type, hours, and work_scope as per implementation.md
   */
  private checkMaterialContextConsistency(context: RuleContext): { reason: string; score: number } | null {
    const { 
      itemName, 
      itemDescription, 
      projectContext, 
      invoiceMetadata,
      serviceLine,
      serviceType,
      hoursOnSite,
      workScopeText
    } = context;
    
    // Extract item categories from name/description
    const itemText = `${itemName} ${itemDescription || ''}`.toLowerCase();
    const itemCategories = this.categorizeItem(itemText);
    
    if (itemCategories.length === 0) {
      return null; // Cannot categorize, skip check
    }

    // Enhanced context extraction including service fields
    const serviceContextText = this.extractServiceContextText({
      serviceLine,
      serviceType,
      hoursOnSite,
      workScopeText,
      projectContext,
      invoiceMetadata
    });
    
    const serviceContextCategories = this.categorizeItem(serviceContextText);
    
    if (serviceContextCategories.length === 0) {
      return null; // No service context available, skip check
    }

    // Check for category overlap
    const overlap = itemCategories.some(itemCat => serviceContextCategories.includes(itemCat));
    
    // Enhanced inconsistency detection based on service type mismatch
    if (!overlap) {
      const inconsistencyReason = this.buildServiceInconsistencyReason(context, itemCategories, serviceContextCategories);
      
      return {
        reason: inconsistencyReason,
        score: this.calculateInconsistencyScore(context, itemCategories, serviceContextCategories),
      };
    }

    return null; // Categories are consistent
  }

  /**
   * Categorize item based on keywords
   */
  private categorizeItem(text: string): string[] {
    const categories: string[] = [];
    
    for (const [category, keywords] of Object.entries(this.contextKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        categories.push(category);
      }
    }
    
    return categories;
  }

  /**
   * Enhanced: Extract service context text including service_line, service_type, etc.
   */
  private extractServiceContextText(context: {
    serviceLine?: string;
    serviceType?: string;
    hoursOnSite?: number;
    workScopeText?: string;
    projectContext?: string;
    invoiceMetadata?: Record<string, any>;
  }): string {
    const contextParts: string[] = [];
    
    // Add service-specific context (high priority)
    if (context.serviceLine) {
      contextParts.push(context.serviceLine);
    }
    
    if (context.serviceType) {
      contextParts.push(context.serviceType);
    }
    
    if (context.workScopeText) {
      contextParts.push(context.workScopeText);
    }
    
    // Add traditional context
    if (context.projectContext) {
      contextParts.push(context.projectContext);
    }
    
    if (context.invoiceMetadata) {
      // Extract relevant metadata fields
      const relevantFields = ['project_name', 'project_type', 'description', 'category', 'department'];
      for (const field of relevantFields) {
        if (context.invoiceMetadata[field] && typeof context.invoiceMetadata[field] === 'string') {
          contextParts.push(context.invoiceMetadata[field]);
        }
      }
    }
    
    return contextParts.join(' ').toLowerCase();
  }

  /**
   * Build detailed inconsistency reason based on service context
   */
  private buildServiceInconsistencyReason(
    context: RuleContext,
    itemCategories: string[],
    serviceCategories: string[]
  ): string {
    const { serviceLine, serviceType, hoursOnSite, workScopeText } = context;
    
    let reason = `This item looks atypical for`;
    
    // Build context description
    if (serviceLine && serviceType) {
      reason += ` ${serviceLine}/${serviceType}`;
    } else if (serviceLine) {
      reason += ` ${serviceLine} service`;
    } else if (serviceType) {
      reason += ` ${serviceType} work`;
    } else {
      reason += ` this project type`;
    }
    
    // Add hours context if significant
    if (hoursOnSite && hoursOnSite > 0) {
      if (hoursOnSite < 4) {
        reason += ` (quick ${hoursOnSite}h job)`;
      } else if (hoursOnSite > 40) {
        reason += ` (extended ${hoursOnSite}h project)`;
      }
    }
    
    // Add work scope context
    if (workScopeText && workScopeText.length > 10) {
      const scopePreview = workScopeText.length > 50 
        ? workScopeText.substring(0, 50) + "..."
        : workScopeText;
      reason += ` given scope: "${scopePreview}"`;
    }
    
    reason += `. Explain why this ${itemCategories.join('/')} item was needed.`;
    
    return reason;
  }

  /**
   * Calculate inconsistency confidence score based on service context strength
   */
  private calculateInconsistencyScore(
    context: RuleContext,
    itemCategories: string[],
    serviceCategories: string[]
  ): number {
    const { serviceLine, serviceType, hoursOnSite, workScopeText } = context;
    
    let baseScore = 0.3; // Default inconsistency confidence
    
    // Increase confidence if we have strong service context
    if (serviceLine && serviceType) baseScore += 0.2;
    if (workScopeText && workScopeText.length > 20) baseScore += 0.1;
    if (hoursOnSite && hoursOnSite > 0) baseScore += 0.1;
    
    // Increase confidence for highly specific mismatches
    const categoryMismatchStrength = this.assessCategoryMismatch(itemCategories, serviceCategories);
    baseScore += categoryMismatchStrength * 0.2;
    
    return Math.min(0.9, baseScore); // Cap at 90% confidence
  }

  /**
   * Assess how severe the category mismatch is
   */
  private assessCategoryMismatch(itemCategories: string[], serviceCategories: string[]): number {
    // Define strong mismatches (completely unrelated domains)
    const strongMismatches = [
      ['office', 'construction'], ['office', 'plumbing'], ['office', 'hvac'],
      ['medical', 'automotive'], ['medical', 'construction'],
      ['catering', 'electrical'], ['catering', 'construction']
    ];
    
    for (const [cat1, cat2] of strongMismatches) {
      const hasItemCat = itemCategories.includes(cat1) || itemCategories.includes(cat2);
      const hasServiceCat = serviceCategories.includes(cat1) || serviceCategories.includes(cat2);
      
      if (hasItemCat && hasServiceCat) {
        // Check if they're opposites
        if ((itemCategories.includes(cat1) && serviceCategories.includes(cat2)) ||
            (itemCategories.includes(cat2) && serviceCategories.includes(cat1))) {
          return 1.0; // Strong mismatch
        }
      }
    }
    
    return 0.5; // Moderate mismatch
  }

  /**
   * Check for service-specific inconsistencies beyond basic material matching
   */
  private checkServiceSpecificInconsistency(context: RuleContext): { reason: string; score: number } | null {
    const { serviceLine, serviceType, hoursOnSite, workScopeText, unitPrice, quantity } = context;
    
    // Skip if no service context available
    if (!serviceLine && !serviceType && !workScopeText) {
      return null;
    }

    // Check for quick service with expensive/high-quantity items
    if (hoursOnSite && hoursOnSite <= 2) {
      const totalValue = unitPrice * quantity;
      if (totalValue > 1000) {
        return {
          reason: `High-value item ($${totalValue.toFixed(2)}) for quick ${hoursOnSite}h service - explain necessity`,
          score: 0.7
        };
      }
      if (quantity > 10) {
        return {
          reason: `Large quantity (${quantity}) for short ${hoursOnSite}h service - justify requirement`,
          score: 0.6
        };
      }
    }

    // Check for maintenance service with construction materials
    if (serviceType?.toLowerCase().includes('maintenance') || serviceLine?.toLowerCase().includes('maintenance')) {
      const itemText = `${context.itemName} ${context.itemDescription || ''}`.toLowerCase();
      const constructionTerms = ['concrete', 'lumber', 'steel beam', 'rebar', 'foundation'];
      
      if (constructionTerms.some(term => itemText.includes(term))) {
        return {
          reason: `Construction materials for maintenance service - confirm this is appropriate`,
          score: 0.8
        };
      }
    }

    // Check for office service with industrial items
    if (serviceLine?.toLowerCase().includes('office') || workScopeText?.toLowerCase().includes('office')) {
      const itemText = `${context.itemName} ${context.itemDescription || ''}`.toLowerCase();
      const industrialTerms = ['industrial', 'heavy duty', 'commercial grade', 'industrial grade'];
      
      if (industrialTerms.some(term => itemText.includes(term))) {
        return {
          reason: `Industrial-grade item for office environment - explain special requirements`,
          score: 0.6
        };
      }
    }

    return null;
  }

  /**
   * Legacy method for backward compatibility
   */
  private extractContextText(projectContext?: string, invoiceMetadata?: Record<string, any>): string {
    return this.extractServiceContextText({ projectContext, invoiceMetadata });
  }

  /**
   * Get price range for canonical item
   */
  private async getPriceRange(canonicalItemId: string): Promise<{ minPrice: number; maxPrice: number } | null> {
    if (!supabase) {
      return null;
    }

    try {
      if (!this.priceRangesCache) {
        const { data, error } = await supabase
          .from('item_price_ranges')
          .select('canonical_item_id, min_price, max_price');
        
        if (error) throw error;
        
        this.priceRangesCache = {};
        for (const row of data || []) {
          this.priceRangesCache[row.canonical_item_id] = {
            minPrice: row.min_price,
            maxPrice: row.max_price,
          };
        }
      }

      return this.priceRangesCache[canonicalItemId] || null;

    } catch (error) {
      console.error('[Rule Agent] Failed to get price range:', error);
      return null;
    }
  }

  /**
   * Check if vendor is excluded (placeholder implementation)
   */
  private isVendorExcluded(vendorId: string): boolean {
    // Placeholder - would check against business_rules table
    const excludedVendors = ['EXCLUDED_VENDOR_001', 'BLACKLISTED_VENDOR'];
    return excludedVendors.includes(vendorId);
  }

  /**
   * Check for blacklisted terms
   */
  private checkBlacklistedTerms(itemName: string): string | null {
    const blacklistedTerms = [
      'alcohol', 'tobacco', 'gambling', 'adult', 'weapon', 'drug',
      'personal', 'gift', 'entertainment', 'political', 'religious'
    ];
    
    const lowerName = itemName.toLowerCase();
    return blacklistedTerms.find(term => lowerName.includes(term)) || null;
  }

  /**
   * Generate explanation prompt for user
   */
  private generateExplanationPrompt(context: RuleContext, reasons: string[]): string {
    const { itemName, canonicalItemId } = context;
    
    let prompt = `Please provide additional context for the following item:\n\n`;
    prompt += `Item: "${itemName}"\n`;
    if (canonicalItemId) {
      prompt += `Matched to: ${canonicalItemId}\n`;
    }
    prompt += `\nReasons for review:\n`;
    
    for (const reason of reasons) {
      prompt += `• ${reason}\n`;
    }
    
    prompt += `\nPlease explain:\n`;
    prompt += `• How this item relates to your project\n`;
    prompt += `• Why this quantity/price is appropriate\n`;
    prompt += `• Any special circumstances or context\n`;
    
    return prompt;
  }

  /**
   * Log rule evaluation event
   */
  private async logRuleEvent(lineItemId: string, data: Record<string, any>): Promise<void> {
    if (!supabase) {
      return;
    }

    try {
      await supabase
        .from('item_validation_events')
        .insert({
          agent_run_id: null,
          line_item_id: lineItemId,
          event_type: 'RULES_APPLIED',
          event_data: {
            ...data,
            rule_engine_version: '2.1.0',
            timestamp: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
        });

    } catch (error) {
      console.error('[Rule Agent] Failed to log rule event:', error);
    }
  }

  /**
   * Get rule engine statistics
   */
  getRuleStats(): Record<string, any> {
    return {
      ruleEngineVersion: '2.1.0',
      deterministicRulesCount: 8,
      llmRulesEnabled: false,
      serviceContextEnabled: true,
      newRulesInV21: ['MATERIAL_INCONSISTENT_WITH_CONTEXT', 'SERVICE_CONTEXT_INCONSISTENT'],
      policyCodesAvailable: [
        'NO_CANONICAL_MATCH',
        'NO_PRICE_BAND', 
        'PRICE_EXCEEDS_MAX_150',
        'PRICE_BELOW_MIN_50',
        'MATERIAL_INCONSISTENT_WITH_CONTEXT',
        'VENDOR_EXCLUDED_BY_RULE',
        'SERVICE_CONTEXT_INCONSISTENT',
        'QUANTITY_OVER_LIMIT',
        'BLACKLISTED_ITEM',
      ],
      contextCategories: Object.keys(this.contextKeywords),
      serviceContextFields: ['serviceLine', 'serviceType', 'hoursOnSite', 'workScopeText'],
    };
  }
}

// Singleton instance
export const enhancedRuleAgent = new EnhancedRuleAgent();