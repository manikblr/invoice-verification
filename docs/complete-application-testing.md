# Complete Application Testing Guide

## 🚀 Testing the Entire Enhanced Invoice Verification Application

### Prerequisites

```bash
# 1. Start the application
npm run dev

# 2. Verify environment variables are loaded
# Check that .env contains:
# - OPENROUTER_API_KEY (for GPT-5 classification)
# - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for database)
# - FEATURE_WEB_INGEST=true (to enable web search agent)

# 3. Application should be running on http://localhost:3000
```

## 🧪 Complete End-to-End Testing Workflow

### **Step 1: Test Core API Endpoints**

#### **A. Enhanced Pre-Validation with Service Context**
```bash
curl -X POST http://localhost:3000/api/items/validate \
  -H "Content-Type: application/json" \
  -d '{
    "lineItemId": "test-001",
    "itemName": "DEWALT 20V MAX Cordless Drill",
    "itemDescription": "Brushless drill with battery and charger",
    "serviceLine": "General Maintenance", 
    "serviceType": "Equipment Repair",
    "scopeOfWork": "Monthly equipment maintenance and repair tasks"
  }'
```

**Expected Response:**
```json
{
  "verdict": "APPROVED",
  "score": 0.9,
  "reasons": [
    "Contains 2 FM material keyword(s)",
    "GPT-5: High confidence item relevance"
  ],
  "validationEventId": "uuid",
  "durationMs": 850
}
```

#### **B. Enhanced Web Search Agent with Classification**
```bash
curl -X POST http://localhost:3000/api/items/search_ingest \
  -H "Content-Type: application/json" \
  -d '{
    "lineItemId": "test-002",
    "itemName": "Milwaukee M18 Impact Driver",
    "itemDescription": "18V brushless impact driver with battery",
    "priority": 8
  }'
```

**Expected Response:**
```json
{
  "ingested": 1,
  "links": 1, 
  "queued": 1,
  "jobIds": ["job-uuid"],
  "queueStats": {
    "total": 1,
    "pending": 0,
    "processing": 1
  }
}
```

#### **C. Check Web Search Job Status**
```bash
# Wait 10-15 seconds for processing, then:
curl "http://localhost:3000/api/items/search_ingest?jobId=JOB-ID-FROM-ABOVE"
```

**Expected Response:**
```json
{
  "service": "web_search_ingestion",
  "status": "enabled",
  "job": {
    "status": "completed",
    "result": {
      "ingested": 1,
      "links": 1,
      "classifications": 1,
      "canonicalItems": 1
    }
  },
  "features": [
    "GPT-5 material/equipment classification",
    "Automatic canonical item creation with classification"
  ]
}
```

### **Step 2: Test Complete Invoice Validation Pipeline**

#### **A. Submit Complete Invoice (if endpoint exists)**
```bash
curl -X POST http://localhost:3000/api/validate-enhanced \
  -H "Content-Type: application/json" \
  -d '{
    "scope_of_work": "Quarterly HVAC maintenance and equipment inspection",
    "service_line_id": 1,
    "service_type_id": 5,
    "labor_hours": 8,
    "materials": [
      {
        "name": "MERV 8 Air Filter 16x25x1",
        "quantity": 4,
        "unit": "each",
        "unit_price": 12.50
      },
      {
        "name": "HVAC Cleaning Solution",
        "quantity": 1,
        "unit": "gallon", 
        "unit_price": 28.99
      }
    ],
    "equipment": [
      {
        "name": "Digital Multimeter",
        "quantity": 1,
        "unit": "day",
        "unit_price": 15.00
      }
    ]
  }'
```

#### **B. Test Service Context Integration**
```bash
# Test material item with HVAC context
curl -X POST http://localhost:3000/api/items/validate \
  -H "Content-Type: application/json" \
  -d '{
    "lineItemId": "test-003",
    "itemName": "MERV 8 Air Filter",
    "serviceLine": "HVAC Maintenance",
    "serviceType": "Filter Replacement", 
    "scopeOfWork": "Replace air filters in commercial building HVAC system"
  }'

# Test equipment item with maintenance context  
curl -X POST http://localhost:3000/api/items/validate \
  -H "Content-Type: application/json" \
  -d '{
    "lineItemId": "test-004",
    "itemName": "Digital Multimeter",
    "serviceLine": "Electrical Maintenance",
    "serviceType": "Diagnostic Testing",
    "scopeOfWork": "Electrical system testing and troubleshooting"
  }'

# Test irrelevant item rejection
curl -X POST http://localhost:3000/api/items/validate \
  -H "Content-Type: application/json" \
  -d '{
    "lineItemId": "test-005", 
    "itemName": "Office Desk and Chair Set",
    "serviceLine": "Plumbing Maintenance",
    "serviceType": "Pipe Repair",
    "scopeOfWork": "Fix leaking pipes in basement"
  }'
```

### **Step 3: Test Batch Processing**

#### **A. Batch Web Search with Mixed Item Types**
```bash
curl -X POST http://localhost:3000/api/items/search_ingest \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "lineItemId": "batch-001",
        "itemName": "DEWALT Cordless Drill DCD771C2",
        "priority": 7
      },
      {
        "lineItemId": "batch-002", 
        "itemName": "1/2 inch Copper Pipe Elbow",
        "priority": 5
      },
      {
        "lineItemId": "batch-003",
        "itemName": "Stanley 25ft Measuring Tape", 
        "priority": 6
      },
      {
        "lineItemId": "batch-004",
        "itemName": "12 AWG Electrical Wire 100ft",
        "priority": 4
      }
    ]
  }'
```

#### **B. Batch Validation with Service Context**
```bash
curl -X POST http://localhost:3000/api/items/validate \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "lineItemId": "batch-val-001",
        "itemName": "HVAC Thermostat Digital",
        "serviceLine": "HVAC Maintenance",
        "serviceType": "Equipment Upgrade"
      },
      {
        "lineItemId": "batch-val-002",
        "itemName": "PVC Pipe 4 inch Schedule 40", 
        "serviceLine": "Plumbing Maintenance",
        "serviceType": "Pipe Installation"
      }
    ]
  }'
```

### **Step 4: Monitor Application Health**

#### **A. Check All Service Endpoints**
```bash
# Pre-validation service
curl http://localhost:3000/api/items/validate

# Web search service  
curl http://localhost:3000/api/items/search_ingest

# Meta/taxonomy service (if available)
curl http://localhost:3000/api/meta

# Suggestion service (if available) 
curl http://localhost:3000/api/suggest_items
```

#### **B. Check Queue Status**
```bash
# Monitor web search queue
curl "http://localhost:3000/api/items/search_ingest" | jq '.queueStats'
```

### **Step 5: Test Web Interface (if available)**

#### **A. Navigate to Main Application**
```
Open browser: http://localhost:3000
```

#### **B. Test Invoice Form Workflow**
1. **Fill Invoice Details:**
   - Scope of Work: "Monthly facility maintenance"
   - Service Line: Select "General Maintenance"  
   - Service Type: Select "Preventive Maintenance"
   - Labor Hours: 8

2. **Add Materials:**
   - Name: "HVAC Air Filter MERV 8"
   - Quantity: 6
   - Unit: each
   - Unit Price: $12.50

3. **Add Equipment:**
   - Name: "Digital Multimeter Fluke"
   - Quantity: 1  
   - Unit: day
   - Unit Price: $25.00

4. **Submit for Validation**

#### **C. Expected Results in UI**
- ✅ Materials classified correctly as "Material"
- ✅ Equipment classified correctly as "Equipment"  
- ✅ Service context validation working
- ✅ GPT-5 reasoning displayed
- ✅ Confidence scores shown
- ✅ Canonical items created automatically

### **Step 6: Verify Database Integration**

#### **A. Check Canonical Items Created**
```sql
-- Connect to Supabase and run:
SELECT 
  id, 
  kind, 
  canonical_name, 
  default_uom,
  tags,
  created_at
FROM canonical_items 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

#### **B. Check External Items**
```sql  
SELECT 
  source_vendor,
  item_name,
  last_price,
  created_at
FROM external_item_sources
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

#### **C. Check Validation Events**
```sql
SELECT
  verdict,
  reasons,
  score,
  llm_reasoning,
  created_at
FROM item_validation_events  
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### **Step 7: Performance and Error Testing**

#### **A. Test High Load**
```bash
# Submit multiple concurrent requests
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/items/validate \
    -H "Content-Type: application/json" \
    -d "{\"lineItemId\": \"load-test-$i\", \"itemName\": \"Test Item $i\"}" &
done
```

#### **B. Test Error Handling**
```bash
# Invalid UUID
curl -X POST http://localhost:3000/api/items/validate \
  -H "Content-Type: application/json" \
  -d '{"lineItemId": "invalid-uuid", "itemName": "Test"}'

# Missing required fields
curl -X POST http://localhost:3000/api/items/validate \
  -H "Content-Type: application/json"  
  -d '{"lineItemId": "550e8400-e29b-41d4-a716-446655440000"}'

# Empty item name
curl -X POST http://localhost:3000/api/items/validate \
  -H "Content-Type: application/json"
  -d '{"lineItemId": "550e8400-e29b-41d4-a716-446655440000", "itemName": ""}'
```

## ✅ Success Criteria

The complete application is working correctly when:

1. **✅ Core Validation Works**
   - Items validated with service context
   - GPT-5 integration functional
   - Rule-based fallback working

2. **✅ Web Search Classification**
   - Items classified as material/equipment
   - Canonical items created automatically
   - External sources linked correctly

3. **✅ Database Integration** 
   - All tables populated correctly
   - No duplicate canonical items
   - Rich metadata and tags generated

4. **✅ API Responses**
   - All endpoints return proper JSON
   - Error handling graceful
   - Performance acceptable

5. **✅ Web Interface**
   - Forms submit successfully
   - Results display classification info
   - User experience enhanced

The enhanced invoice verification application now provides intelligent material/equipment classification and context-aware validation across the entire pipeline! 🚀