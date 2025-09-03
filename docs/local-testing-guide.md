# Local Testing Guide - Enhanced Web Search Agent

## 🧪 Testing the Material/Equipment Classification

### Prerequisites

1. **Environment Setup**
   ```bash
   # Make sure your .env file has the OpenRouter API key
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   OPENROUTER_PREVALIDATION_MODEL=openai/gpt-4o-2024-11-20
   ```

2. **Database Setup** (optional for classification testing)
   ```bash
   # Only needed for full pipeline testing
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-key
   ```

### 🚀 Quick Tests You Can Run

#### 1. **Classification Unit Tests**
```bash
# Run the classification test suite
npm test -- __tests__/web-ingest/enhanced-classification.test.ts

# This tests:
# ✅ GPT-5 classification (with fallback)
# ✅ Rule-based fallback logic  
# ✅ Batch processing
# ✅ Error handling
```

#### 2. **Individual Classification Testing**
```bash
# Test the classification module directly
node -e "
const { classifyItem } = require('./lib/web-ingest/item-classifier.ts');

(async () => {
  const result = await classifyItem({
    itemName: 'DEWALT Cordless Drill 20V',
    vendor: 'Home Depot',
    sourceUrl: 'https://homedepot.com/drill'
  });
  
  console.log('Classification Result:');
  console.log('Kind:', result.kind);
  console.log('Confidence:', result.confidence);
  console.log('Reasoning:', result.reasoning);
})();
"
```

#### 3. **API Endpoint Testing**
```bash
# Start the development server
npm run dev

# Test the search ingest API
curl -X POST http://localhost:3000/api/items/search_ingest \
  -H "Content-Type: application/json" \
  -d '{
    "lineItemId": "123e4567-e89b-12d3-a456-426614174000",
    "itemName": "DEWALT Cordless Drill",
    "itemDescription": "20V MAX brushless drill",
    "priority": 5
  }'
```

#### 4. **Rule-Based Fallback Testing**
```bash
# Test without API key to verify fallback behavior
OPENROUTER_API_KEY="" npm test -- __tests__/web-ingest/enhanced-classification.test.ts

# Should still work using rule-based classification
```

### 🔍 What Each Test Covers

#### **Classification Logic Tests**
- ✅ Power tools → Equipment
- ✅ Pipe fittings → Materials  
- ✅ Electrical components → Materials
- ✅ Hand tools → Equipment
- ✅ HVAC filters → Materials

#### **Fallback Behavior Tests**
- ✅ GPT-5 API failure handling
- ✅ Rule-based pattern matching
- ✅ Default classification logic
- ✅ Error recovery

#### **Database Integration Tests**  
- ✅ Canonical item creation
- ✅ Tag generation
- ✅ Duplicate detection
- ✅ Supabase integration

### 📊 Expected Results

When testing locally, you should see:

**With OpenRouter API Key:**
```
✅ DEWALT Cordless Drill 20V
   Expected: equipment | Got: equipment  
   Confidence: 90.0%
   Method: GPT-5
   Reasoning: Power drill is a durable tool used repeatedly...
```

**Without API Key (Fallback):**
```
✅ DEWALT Cordless Drill 20V
   Expected: equipment | Got: equipment
   Confidence: 70.0%  
   Method: Rule-based
   Reasoning: Rule-based classification: Item name matches equipment pattern...
```

### 🐛 Troubleshooting

#### **Test Failures**
- Tests may show API failures (401 errors) - this is expected and demonstrates fallback behavior
- Classification accuracy should be 70%+ even with rule-based fallback
- Database tests may need Supabase configuration

#### **Common Issues**
```bash
# TypeScript/ES Module issues
npm run build  # Compile TypeScript first

# Missing environment variables
cp .env.example .env  # Copy environment template
```

### 🔄 Integration Testing

#### **Full Pipeline Test**
```bash
# Test the complete web ingest pipeline
npm test -- __tests__/web-ingest/

# This covers:
# 1. Web scraping simulation
# 2. Item classification  
# 3. Canonical item creation
# 4. External item linking
```

#### **API Integration Test**
```bash
# Test API with different item types
curl -X POST http://localhost:3000/api/items/search_ingest \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "lineItemId": "uuid-1",
        "itemName": "Milwaukee Impact Driver",
        "priority": 5
      },
      {
        "lineItemId": "uuid-2", 
        "itemName": "Copper Pipe Elbow 1/2 inch",
        "priority": 5
      }
    ]
  }'
```

### ✅ Success Criteria

Your local testing is successful if:

1. **Classification works**: Items are correctly classified as material/equipment
2. **Fallback works**: System functions even without GPT-5 API access
3. **API responds**: Endpoints return proper JSON with classification info
4. **Database integration**: Canonical items are created with correct `kind` field
5. **Error handling**: Graceful handling of API failures and edge cases

The enhanced Web Search agent is designed to work robustly in local development environments with comprehensive fallback mechanisms!