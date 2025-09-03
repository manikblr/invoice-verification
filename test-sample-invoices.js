#!/usr/bin/env node

/**
 * Test Script: Process Sample Invoices CSV through Validation Pipeline
 * 
 * This script:
 * 1. Reads sample invoices.csv 
 * 2. Groups line items by job number
 * 3. Runs each job through the enhanced validation pipeline
 * 4. Outputs results to a new CSV with validation status
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

// Configuration
const INPUT_CSV = './sample invoices.csv';
const OUTPUT_CSV = './sample-invoices-validation-results.csv';
const API_URL = 'http://localhost:3000/api/validate-enhanced';
const TEST_START = 60; // Start from record 61 (0-based: record 60)
const TEST_LIMIT = 80; // Test up to record 80 (total 20 records: 61-80)

// Service line and type mappings (from taxonomy API)
const SERVICE_LINE_MAPPING = {
  'Plumbing': 14,
  'Handyman': 6,
  'Electrical': 3,
  'HVAC': 5,
  'Construction': 2,
  'Fire Life Safety': 4,
  'Janitorial': 9,
  'Locksmith': 11,
};

const SERVICE_TYPE_MAPPING = {
  // Plumbing types
  'Extensive Clog': 21,
  'Basic Clog': 7,
  'Leak Detection and Repair': 1363,
  
  // Handyman types  
  'Tile Repair and Replacement': 1276,
  'General Carpentry': 109,
  'Assembly - Fixtures/Goods': 5,
  'Door Replacement and Installation': 1258,
  'Floor Repair and Replacement': 1261,
  'General Equipment Repair': 27,
  'Pest Control': 131,
  
  // Electrical types
  'Exterior Lighting': 91,
  'Interior Lighting': 37,
  'Wiring Installation': 56,
  'Lighting PMI': 1205,
  
  // HVAC types
  'A/C Unit Repair and Replacement': 1223,
  'Refrigeration Repair and Replacement': 1252,
  
  // Construction types  
  'Concrete Floor Repair': 71,
  'Water Damage Repair': 148,
  
  // Fire Life Safety types
  'Fire Alarm PMI': 1214,
  'Fire Alarm Repair': 195,
  
  // Janitorial types
  'Restroom Cleaning': 134,
  
  // Locksmith types
  'Gate Lock Removal and Replacement': 1318,
};

async function readCSV() {
  console.log('📄 Reading sample invoices CSV...');
  
  const fileContent = fs.readFileSync(INPUT_CSV, 'utf8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ','
  });
  
  // Limit to batch of records for testing (records 21-40)
  const limitedRecords = records.slice(TEST_START, TEST_LIMIT);
  console.log(`✅ Read ${limitedRecords.length} line items from CSV (records ${TEST_START + 1}-${TEST_LIMIT} for testing)`);
  return limitedRecords;
}

function groupByJob(records) {
  console.log('📋 Grouping line items by job number...');
  
  const jobGroups = {};
  
  records.forEach(record => {
    const jobNumber = record.JOB_NUMBER;
    if (!jobGroups[jobNumber]) {
      jobGroups[jobNumber] = {
        jobNumber: jobNumber,
        serviceLine: record.SERVICE_LINE,
        serviceType: record.SERVICE_TYPE,
        laborHours: parseFloat(record.Labor) || 0,
        items: []
      };
    }
    
    // Add line item
    jobGroups[jobNumber].items.push({
      name: record.ITEM_NAME,
      type: record.LINE_ITEM_TYPE.toLowerCase() === 'material' ? 'material' : 
            record.LINE_ITEM_TYPE.toLowerCase() === 'equipment' ? 'equipment' : 'labor',
      quantity: parseInt(record.QUANTITY) || 1,
      unitPrice: parseFloat(record.UNIT_PRICE) || 0,
      unit: 'pcs' // Default unit
    });
  });
  
  const jobNumbers = Object.keys(jobGroups);
  console.log(`✅ Grouped into ${jobNumbers.length} unique jobs`);
  console.log(`📊 Jobs: ${jobNumbers.slice(0, 5).join(', ')}${jobNumbers.length > 5 ? '...' : ''}`);
  
  return jobGroups;
}

async function validateJob(jobData) {
  const { jobNumber, serviceLine, serviceType, laborHours, items } = jobData;
  
  // Map service line and type to IDs (fallback to default if not found)
  const serviceLineId = SERVICE_LINE_MAPPING[serviceLine] || 1;
  const serviceTypeId = SERVICE_TYPE_MAPPING[serviceType] || 1;
  
  console.log(`🔍 Validating job ${jobNumber} (${serviceLine} - ${serviceType}) with ${items.length} items...`);
  
  const payload = {
    scopeOfWork: `${serviceLine} - ${serviceType} work for job ${jobNumber}`,
    serviceLineId: serviceLineId,
    serviceTypeId: serviceTypeId,
    laborHours: laborHours,
    items: items,
    includeAgentTraces: true
  };
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log(`✅ Job ${jobNumber} validated - Status: ${result.overallStatus}, ${result.lines?.length || 0} line items processed`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Failed to validate job ${jobNumber}:`, error.message);
    return {
      error: error.message,
      overallStatus: 'ERROR',
      lines: items.map(item => ({
        input: item,
        status: 'ERROR',
        explanation: { summary: `Validation failed: ${error.message}` }
      }))
    };
  }
}

function flattenResults(originalRecords, jobGroups, validationResults) {
  console.log('📊 Flattening results back to line-item format...');
  
  const outputRows = [];
  
  originalRecords.forEach(originalRecord => {
    const jobNumber = originalRecord.JOB_NUMBER;
    const jobValidation = validationResults[jobNumber];
    
    if (!jobValidation || !jobValidation.lines) {
      // Handle error case
      outputRows.push({
        ...originalRecord,
        VALIDATION_STATUS: 'ERROR',
        VALIDATION_REASON: jobValidation?.error || 'Unknown error',
        VALIDATION_CONFIDENCE: '0',
        AGENT_REASONING: '',
        EXPLANATION_PROMPT: ''
      });
      return;
    }
    
    // Find matching line item in validation results
    const itemName = originalRecord.ITEM_NAME;
    const matchingLine = jobValidation.lines.find(line => 
      line.input?.name === itemName || 
      (line.input?.name && itemName && line.input.name.toLowerCase() === itemName.toLowerCase())
    );
    
    if (matchingLine) {
      outputRows.push({
        ...originalRecord,
        VALIDATION_STATUS: matchingLine.status,
        VALIDATION_REASON: matchingLine.explanation?.summary || matchingLine.reasonCodes?.join(', ') || '',
        VALIDATION_CONFIDENCE: (matchingLine.confidenceScore * 100).toFixed(1) + '%',
        AGENT_REASONING: matchingLine.explanation?.reasoning?.slice(0, 200) || '', // Truncate for CSV
        EXPLANATION_PROMPT: matchingLine.explanationPrompt || '',
        AGENT_TRACES: JSON.stringify(matchingLine.agentContributions || []).slice(0, 500), // Agent contributions
        PRE_VALIDATION_AGENT: matchingLine.agentContributions?.find(t => t.agentName === 'Pre-Validation Agent')?.decision || '',
        ITEM_VALIDATOR_AGENT: matchingLine.agentContributions?.find(t => t.agentName === 'Item Validator Agent')?.decision || '',
        ITEM_MATCHER_AGENT: matchingLine.agentContributions?.find(t => t.agentName === 'Item Matcher Agent')?.decision || '',
        WEB_SEARCHER_AGENT: matchingLine.agentContributions?.find(t => t.agentName === 'Web Search & Ingest Agent')?.decision || '',
        PRICE_LEARNER_AGENT: matchingLine.agentContributions?.find(t => t.agentName === 'Price Learner Agent')?.decision || '',
        RULE_APPLIER_AGENT: matchingLine.agentContributions?.find(t => t.agentName === 'Rule Applier Agent')?.decision || '',
        EXPLANATION_AGENT: matchingLine.agentContributions?.find(t => t.agentName === 'Explanation Agent')?.decision || ''
      });
    } else {
      // Fallback if no exact match found
      outputRows.push({
        ...originalRecord,
        VALIDATION_STATUS: 'NOT_FOUND',
        VALIDATION_REASON: 'Could not match item in validation results',
        VALIDATION_CONFIDENCE: '0%',
        AGENT_REASONING: '',
        EXPLANATION_PROMPT: '',
        AGENT_TRACES: '',
        PRE_VALIDATION_AGENT: '',
        ITEM_VALIDATOR_AGENT: '',
        ITEM_MATCHER_AGENT: '',
        WEB_SEARCHER_AGENT: '',
        PRICE_LEARNER_AGENT: '',
        RULE_APPLIER_AGENT: '',
        EXPLANATION_AGENT: ''
      });
    }
  });
  
  console.log(`✅ Created ${outputRows.length} output rows`);
  return outputRows;
}

function writeResultsCSV(outputRows) {
  console.log('💾 Writing results to CSV...');
  
  const csvContent = stringify(outputRows, {
    header: true,
    quoted: true
  });
  
  fs.writeFileSync(OUTPUT_CSV, csvContent);
  console.log(`✅ Results written to ${OUTPUT_CSV}`);
  
  // Print summary
  const statusCounts = {};
  outputRows.forEach(row => {
    const status = row.VALIDATION_STATUS;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  
  console.log('\n📈 VALIDATION SUMMARY:');
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  ${status}: ${count} items`);
  });
}

// Testing notes for improvements
const testingNotes = {
  issues: [],
  improvements: [],
  observations: []
};

function addNote(category, note) {
  testingNotes[category].push(`${new Date().toISOString()}: ${note}`);
  console.log(`📝 [${category.toUpperCase()}] ${note}`);
}

async function main() {
  console.log('🚀 Starting Sample Invoices Validation Test (Records 41-60) - WITH FULL AGENT MONITORING\n');
  
  try {
    // Step 1: Read CSV
    const originalRecords = await readCSV();
    
    // Step 2: Group by job
    const jobGroups = groupByJob(originalRecords);
    
    // Step 3: Validate each job with detailed monitoring
    console.log('\n🔄 Starting validation process with full monitoring...');
    const validationResults = {};
    const performanceMetrics = [];
    
    for (const [jobNumber, jobData] of Object.entries(jobGroups)) {
      const startTime = Date.now();
      console.log(`\n🔍 Testing Job: ${jobNumber}`);
      console.log(`📋 Items: ${jobData.items.map(i => i.name).join(', ')}`);
      
      validationResults[jobNumber] = await validateJob(jobData);
      
      const duration = Date.now() - startTime;
      performanceMetrics.push({ jobNumber, duration, itemCount: jobData.items.length });
      
      // Analyze results for this job
      const result = validationResults[jobNumber];
      if (result.overallStatus) {
        addNote('observations', `Job ${jobNumber} (${jobData.items.length} items): ${result.overallStatus} in ${duration}ms`);
        
        result.lines?.forEach((line, idx) => {
          const item = jobData.items[idx];
          if (line.status === 'REJECT') {
            addNote('issues', `"${item.name}" REJECTED: ${line.explanation?.summary || 'No reason provided'}`);
          } else if (line.status === 'NEEDS_REVIEW') {
            addNote('observations', `"${item.name}" NEEDS_REVIEW: ${line.explanation?.summary || 'Unknown reason'}`);
          }
        });
      }
      
      // Add delay between jobs
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Step 4: Flatten results
    const outputRows = flattenResults(originalRecords, jobGroups, validationResults);
    
    // Step 5: Write output
    writeResultsCSV(outputRows);
    
    // Step 6: Generate testing notes
    await generateTestingNotes(performanceMetrics, outputRows);
    
    console.log('\n🎉 Test completed successfully!');
    console.log(`📂 Results saved to: ${OUTPUT_CSV}`);
    console.log(`📝 Testing notes saved to: ./testing-notes-batch3.md`);
    
  } catch (error) {
    console.error('💥 Test failed:', error);
    addNote('issues', `Test script failure: ${error.message}`);
    await generateTestingNotes([], []);
    process.exit(1);
  }
}

async function generateTestingNotes(performanceMetrics, outputRows) {
  console.log('\n📝 Generating testing notes...');
  
  const notes = `# Invoice Validation Testing Notes - Batch 3 (Records 41-60) - Full Agent Monitoring
*Generated: ${new Date().toISOString()}*

## Test Summary
- **Records Tested**: ${outputRows.length}
- **Jobs Processed**: ${performanceMetrics.length}
- **Total Duration**: ${performanceMetrics.reduce((sum, m) => sum + m.duration, 0)}ms

## Performance Metrics
${performanceMetrics.map(m => 
  `- **${m.jobNumber}**: ${m.itemCount} items processed in ${m.duration}ms (${(m.duration/m.itemCount).toFixed(0)}ms/item)`
).join('\n')}

## Issues Found
${testingNotes.issues.length > 0 ? testingNotes.issues.map(i => `- ${i}`).join('\n') : '- No critical issues found'}

## Key Observations  
${testingNotes.observations.length > 0 ? testingNotes.observations.map(o => `- ${o}`).join('\n') : '- No significant observations'}

## Potential Improvements
${testingNotes.improvements.length > 0 ? testingNotes.improvements.map(i => `- ${i}`).join('\n') : '- Analysis pending based on test results'}

## Validation Status Breakdown
${(() => {
  const statusCounts = {};
  outputRows.forEach(row => {
    const status = row.VALIDATION_STATUS;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  return Object.entries(statusCounts).map(([status, count]) => 
    `- **${status}**: ${count} items (${((count/outputRows.length)*100).toFixed(1)}%)`
  ).join('\n');
})()}

## Examples of Each Status

### Approved Items
${outputRows.filter(r => r.VALIDATION_STATUS === 'ALLOW').slice(0, 3).map(r => 
  `- **${r.ITEM_NAME}** (${r.SERVICE_LINE}): ${r.VALIDATION_REASON}`
).join('\n') || 'None found in this batch'}

### Rejected Items  
${outputRows.filter(r => r.VALIDATION_STATUS === 'REJECT').slice(0, 3).map(r => 
  `- **${r.ITEM_NAME}** (${r.SERVICE_LINE}): ${r.VALIDATION_REASON}`
).join('\n') || 'None found in this batch'}

### Items Needing Review
${outputRows.filter(r => r.VALIDATION_STATUS === 'NEEDS_REVIEW').slice(0, 3).map(r => 
  `- **${r.ITEM_NAME}** (${r.SERVICE_LINE}): ${r.VALIDATION_REASON}`
).join('\n') || 'None found in this batch'}

## Next Steps
1. Review the issues found above
2. Implement fixes for critical problems
3. Run next batch of 20 records (records 21-40)
4. Continue iterative improvement process
`;

  fs.writeFileSync('./testing-notes-batch3.md', notes);
  console.log('✅ Testing notes generated');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Test interrupted by user');
  process.exit(0);
});

// Run the test
if (require.main === module) {
  main();
}

module.exports = { main, readCSV, groupByJob, validateJob };