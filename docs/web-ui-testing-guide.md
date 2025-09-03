# Web UI Testing Guide - Enhanced Web Search Agent

## 🌐 Testing at http://localhost:3000 (or 3001)

### Prerequisites
```bash
# Start the development server
npm run dev

# The server will run on http://localhost:3000 (or the next available port)
```

### 🧪 Testing the Enhanced Web Search Agent

#### 1. **API Endpoint Testing**

**Test Web Search Ingest API:**
```bash
# Single item classification test
curl -X POST http://localhost:3000/api/items/search_ingest \
  -H "Content-Type: application/json" \
  -d '{
    "lineItemId": "550e8400-e29b-41d4-a716-446655440000",
    "itemName": "DEWALT 20V MAX Cordless Drill",
    "itemDescription": "Brushless cordless drill with battery and charger",
    "priority": 8
  }'
```

**Expected Response:**
```json
{
  "ingested": 1,
  "links": 1,
  "queued": 1,
  "jobIds": ["uuid-job-id"],
  "queueStats": {
    "total": 1,
    "pending": 0,
    "processing": 1,
    "completed": 0,
    "failed": 0
  },
  "message": "Initiated web search and ingestion for 1 items"
}
```

#### 2. **Check Job Status**

```bash
# Get job status with enhanced classification info
curl "http://localhost:3000/api/items/search_ingest?jobId=YOUR-JOB-ID"
```

**Expected Response with Classification:**
```json
{
  "service": "web_search_ingestion",
  "status": "enabled",
  "job": {
    "id": "job-uuid",
    "lineItemId": "item-uuid", 
    "itemName": "DEWALT 20V MAX Cordless Drill",
    "status": "completed",
    "result": {
      "ingested": 1,
      "links": 1,
      "classifications": 1,
      "canonicalItems": 1
    }
  },
  "features": [
    "Multi-vendor web search (Grainger, Home Depot, Amazon Business)",
    "GPT-5 material/equipment classification",
    "Automatic canonical item creation with classification",
    "Automatic canonical item linking"
  ]
}
```

#### 3. **Batch Classification Testing**

```bash
# Test multiple items at once
curl -X POST http://localhost:3000/api/items/search_ingest \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "lineItemId": "550e8400-e29b-41d4-a716-446655440001",
        "itemName": "Milwaukee M18 Impact Driver",
        "itemDescription": "18V brushless impact driver",
        "priority": 7
      },
      {
        "lineItemId": "550e8400-e29b-41d4-a716-446655440002", 
        "itemName": "1/2 inch Copper Pipe Elbow",
        "itemDescription": "Sweat connection copper fitting",
        "priority": 5
      },
      {
        "lineItemId": "550e8400-e29b-41d4-a716-446655440003",
        "itemName": "MERV 8 Air Filter 16x25x1",
        "itemDescription": "Pleated HVAC air filter",
        "priority": 6
      }
    ]
  }'
```

#### 4. **Service Status Check**

```bash
# Check overall service status and features
curl http://localhost:3000/api/items/search_ingest
```

### 🔍 Testing Pre-Validation with Service Context

**Test Enhanced Pre-Validation API:**
```bash
curl -X POST http://localhost:3000/api/items/validate \
  -H "Content-Type: application/json" \
  -d '{
    "lineItemId": "550e8400-e29b-41d4-a716-446655440004",
    "itemName": "HVAC air filter MERV 8",
    "itemDescription": "High-efficiency air filter for commercial HVAC",
    "serviceLine": "HVAC Maintenance",
    "serviceType": "Preventive Maintenance",
    "scopeOfWork": "Quarterly HVAC system maintenance including filter replacement"
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
  "validationEventId": "validation-uuid",
  "durationMs": 850
}
```

### 🌐 Web Interface Testing

#### **If you have a web UI at localhost:3000:**

1. **Navigate to Forms/Pages:**
   - Invoice submission form
   - Item validation page
   - Web search ingest interface

2. **Test Workflow:**
   ```
   1. Enter item information
   2. Select service line/type
   3. Add scope of work
   4. Submit for processing
   5. Check results with classification
   ```

3. **Expected Enhancements:**
   - Items classified as "Material" or "Equipment"
   - Classification confidence scores displayed
   - GPT-5 reasoning shown in results
   - Canonical items created automatically

### 📊 Monitoring and Debugging

#### **Development Console Logs**

When running `npm run dev`, watch for:

```
[Web Ingest Queue] Added job abc123 for item: DEWALT Drill
[Web Ingest Queue] Job abc123 completed with 1 results:
  - 1 external items saved
  - 1 canonical items created/found  
  - 1 links created
  - 1 items classified
  - Classifications: 0 materials, 1 equipment

[Web Ingest Database] Created canonical equipment: dewalt 20v max cordless drill (confidence: 0.9)
```

#### **Database Verification**

Check Supabase tables:
- `canonical_items`: New items with `kind` field populated
- `external_item_sources`: Web-scraped items stored
- `canonical_item_links`: Automatic linking created
- `item_validation_events`: Enhanced validation results

### 🧪 Complete End-to-End Test Scenario

```bash
# 1. Start dev server
npm run dev

# 2. Submit item for web search + classification
curl -X POST http://localhost:3000/api/items/search_ingest \
  -H "Content-Type: application/json" \
  -d '{
    "lineItemId": "test-e2e-001",
    "itemName": "DeWalt DCD771C2 20V MAX Cordless Drill",
    "priority": 10
  }'

# 3. Wait a moment for processing, then check status  
curl "http://localhost:3000/api/items/search_ingest?lineItemId=test-e2e-001"

# 4. Test pre-validation with service context
curl -X POST http://localhost:3000/api/items/validate \
  -H "Content-Type: application/json" \
  -d '{
    "lineItemId": "test-e2e-002", 
    "itemName": "DeWalt DCD771C2 20V MAX Cordless Drill",
    "serviceLine": "General Maintenance",
    "serviceType": "Equipment Repair"
  }'

# 5. Check canonical items created
# (Would require database query or admin interface)
```

### ✅ Success Indicators

You'll know the enhanced system is working when:

1. **✅ API Responses Include Classification Data**
   - `classifications` count in responses
   - `canonicalItems` count showing items created

2. **✅ GPT-5 Integration Working**
   - Console logs show GPT-5 classification attempts
   - High confidence scores (0.8+) when API succeeds
   - Fallback to rule-based when API fails

3. **✅ Database Integration**
   - `canonical_items` table populated with `kind` field
   - Rich tags generated for searchability
   - No duplicate canonical items created

4. **✅ Enhanced Pre-Validation**
   - Service context considered in validation
   - LLM reasoning included in responses
   - Better accuracy for contextual relevance

The enhanced Web Search agent provides a complete material/equipment classification pipeline accessible through the web interface!