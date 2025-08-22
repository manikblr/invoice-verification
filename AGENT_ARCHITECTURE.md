# Agent Architecture Documentation

This document provides a comprehensive overview of all agents implemented in the invoice verification system with full **Langfuse integration**, **OpenRouter model flexibility**, and **LLM-powered evaluation**.

## System Overview

The system uses **CrewAI** for multi-agent coordination with **Langfuse** for prompt management, observability, and comprehensive LLM monitoring. **OpenRouter** provides flexible model selection across multiple providers. The system includes **5 distinct agent categories** with real-time evaluation and monitoring.

## 🎯 Key Architectural Features

- **Full Langfuse Integration**: All agents use Langfuse-managed prompts and tracing
- **OpenRouter Model Flexibility**: Switch between different LLM providers and models
- **Enhanced Judge System**: LLM-powered evaluation of every agent operation
- **Real-time Performance Monitoring**: Comprehensive metrics and analytics
- **Multi-Provider Support**: OpenAI, Anthropic, Google, Meta, Mistral via OpenRouter

## 1. Core Invoice Processing Agents (`agents/agents.py`)

These are the **primary business logic agents** that process invoices in a sequential pipeline with **comprehensive evaluation**:

### 1.1 **Item Matcher Agent**
- **Role**: Item Matcher  
- **Purpose**: Matches invoice line items to canonical catalog items
- **Algorithm**: Hybrid search (exact → synonyms → fuzzy matching)
- **Tool**: `ItemMatcherTool` → `MatchingTool`
- **Model Selection**: Task-optimized via OpenRouter
- **Output**: Match confidence scores, canonical item IDs
- **Evaluation**: Real-time judge assessment of match quality
- **Key Features**:
  - Uses RapidFuzz for fuzzy string matching
  - Confidence thresholds: >0.75 creates synonym proposals
  - Caches canonical items and synonyms for performance
  - Logs all matching attempts for analysis
  - **Performance Tracking**: Response time, confidence calibration, accuracy

**Judge Evaluation Criteria**:
- Match Accuracy: Semantic similarity between input and matched item
- Confidence Calibration: Appropriateness of confidence scores
- Efficiency: Speed and resource usage
- Edge Case Handling: Management of ambiguous cases

### 1.2 **Price Learner Agent**
- **Role**: Price Learner
- **Purpose**: Validates unit prices against expected ranges and learns from pricing patterns  
- **Tool**: `PriceLearnerTool` → `PricingTool`
- **Model Selection**: Task-optimized via OpenRouter
- **Output**: Price validation results, range adjustment proposals
- **Evaluation**: Real-time assessment of pricing decisions
- **Key Features**:
  - 20% variance threshold for flagging anomalies
  - Creates PRICE_RANGE_ADJUST proposals for out-of-band prices
  - Learns from pricing patterns to improve ranges over time
  - Supports price band expansion/contraction based on market data
  - **Performance Tracking**: Validation accuracy, learning effectiveness

**Judge Evaluation Criteria**:
- Validation Accuracy: Correct identification of price reasonableness
- Learning Quality: Effectiveness of price range adjustments
- Risk Assessment: Appropriate flagging of anomalies
- Market Awareness: Understanding of pricing context

### 1.3 **Rule Applier Agent**
- **Role**: Rule Applier
- **Purpose**: Applies deterministic business rules to determine line item approval status
- **Tool**: `RuleApplierTool` → `RulesTool`
- **Model Selection**: Task-optimized via OpenRouter
- **Output**: ALLOW/DENY/NEEDS_MORE_INFO decisions with policy codes
- **Evaluation**: Real-time assessment of rule application
- **Key Features**:
  - **7 deterministic business rules**:
    1. `NO_CANONICAL_MATCH` - No matching catalog item found
    2. `NO_PRICE_BAND` - No price range data available
    3. `PRICE_EXCEEDS_MAX_150` - Price >150% of max allowed
    4. `PRICE_BELOW_MIN_50` - Price <50% of min allowed
    5. `VENDOR_EXCLUDED_BY_RULE` - Vendor blocked by business rule
    6. `QUANTITY_OVER_LIMIT` - Quantity exceeds defined limits
    7. `BLACKLISTED_ITEM` - Item is blacklisted
  - Confidence scoring and human-readable explanations
  - Stable policy codes for consistent decision tracking
  - **Performance Tracking**: Decision quality, policy compliance

**Judge Evaluation Criteria**:
- Rule Accuracy: Correct application of business rules
- Decision Quality: Sound reasoning for decisions
- Explanation Clarity: Quality of decision explanations
- Policy Compliance: Adherence to organizational policies

## 2. Item Validation Agent (`agents/validation_agent.py`)

**Enhanced LLM-powered user abuse detection system** with comprehensive evaluation:

### 2.1 **Item Validator Agent**
- **Role**: Item Validator
- **Purpose**: **Validates user-submitted items to detect inappropriate content and ensure proper material/equipment classification**
- **Tool**: `ItemValidationTool`
- **Model Selection**: Validation-optimized via OpenRouter
- **Output**: APPROVED/REJECTED/NEEDS_REVIEW decisions with confidence scores
- **Evaluation**: LLM judge assessment of validation accuracy
- **Key Features**:
  - **LLM-Powered Classification**: Advanced content understanding
  - **Profanity Detection**: Catches inappropriate language
  - **Content Classification**: Distinguishes facility management items from personal/unrelated items
  - **Abuse Pattern Recognition**: Detects spam, nonsensical text, test submissions
  - **Full Langfuse Integration**: Prompt management and LLM observability
  - **Rule-based Fallback**: Backup system when LLM unavailable
  - **Performance Tracking**: Classification accuracy, abuse detection rate

**Validation Categories**:
- ✅ **APPROVED**: Construction materials, plumbing supplies, electrical components, tools, safety equipment
- ❌ **REJECTED**: Personal items, food/beverages, inappropriate content, spam, profanity
- ⚠️ **NEEDS_REVIEW**: Unclear classifications requiring human judgment

**Judge Evaluation Criteria**:
- Classification Accuracy: Correct identification of appropriate content
- Abuse Detection: Effectiveness in catching inappropriate submissions
- Reasoning Quality: Clear explanation of validation decisions
- Consistency: Consistent application of validation criteria

## 3. Enhanced Judge System (`agents/enhanced_judge_system.py`)

**Comprehensive LLM-powered evaluation system** that monitors all agent performance:

### 3.1 **Specialized Judge Agents**
- **Item Match Judge**: Evaluates item matching quality and confidence
- **Price Judge**: Assesses pricing validation and reasonableness
- **Validation Judge**: Monitors content classification accuracy
- **Crew Orchestrator Judge**: Evaluates overall pipeline performance

### 3.2 **Performance Metrics**
- **Response Time**: Execution speed for each agent
- **Accuracy**: Correctness of agent decisions
- **Confidence**: Agent confidence vs actual performance
- **Throughput**: Items processed per unit time
- **Error Rate**: Frequency of failures or degraded performance
- **Cost**: Computational and LLM usage costs

### 3.3 **Real-time Evaluation Process**
1. **Session Creation**: Each agent operation gets evaluation session
2. **Metric Recording**: Performance data captured in real-time
3. **LLM Judging**: Specialized prompts assess agent output quality
4. **Score Aggregation**: Overall performance scores calculated
5. **Recommendation Generation**: Actionable improvement suggestions

## 4. OpenRouter Integration (`llm/openrouter_client.py`)

**Flexible multi-provider LLM access** with cost optimization and model selection:

### 4.1 **Supported Providers**
- **OpenAI**: GPT-4o, GPT-4o-mini, GPT-3.5-turbo
- **Anthropic**: Claude-3-opus, Claude-3-sonnet, Claude-3-haiku
- **Google**: Gemini-pro, Gemini-flash
- **Meta**: Llama-3.1-8b, Llama-3.1-70b
- **Mistral**: Mistral-7b, Mixtral-8x7b

### 4.2 **Model Tiers**
- **Fast**: Quick responses, lower cost (e.g., Claude-3-haiku, GPT-3.5-turbo)
- **Standard**: Balanced performance (e.g., GPT-4o-mini, Claude-3-sonnet)
- **Premium**: High quality (e.g., GPT-4o, Claude-3-opus)
- **Reasoning**: Complex analysis (e.g., GPT-4o for judge evaluations)

### 4.3 **Task-Specific Model Selection**
```
validation → OPENROUTER_MODEL (standard tasks)
judging → OPENROUTER_JUDGE_MODEL (evaluation tasks)
reasoning → Premium models (complex analysis)
fallback → OPENROUTER_FALLBACK_MODEL (error recovery)
```

### 4.4 **Configuration**
```bash
# OpenRouter Configuration
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=qwen/qwen3-30b-a3b-instruct-2507
OPENROUTER_JUDGE_MODEL=moonshotai/kimi-k2:free
OPENROUTER_FALLBACK_MODEL=google/gemma-3n-e2b-it:free
```

## 5. Langfuse Integration (`agents/langfuse_integration.py`)

**Complete observability and prompt management** system:

### 5.1 **Prompt Management**
- **Centralized Prompts**: All agent prompts managed via Langfuse
- **Version Control**: Track prompt changes and performance impact
- **A/B Testing**: Compare different prompt variations
- **Dynamic Updates**: Update prompts without code deployment

### 5.2 **LLM Call Tracing**
- **Full Request Tracing**: Input, output, metadata captured
- **Provider Abstraction**: Works with OpenRouter and OpenAI
- **Performance Metrics**: Token usage, latency, costs tracked
- **Error Handling**: Graceful fallbacks and error logging

### 5.3 **Evaluation Logging**
- **Judge Assessments**: All evaluations logged to Langfuse
- **Score Tracking**: Performance trends and improvements
- **Trace Linking**: Connect evaluations to original operations
- **Metadata Enrichment**: Context and reasoning captured

### 5.4 **Configuration**
```bash
# Langfuse Configuration
LANGFUSE_PUBLIC_KEY=pk-lf-85f902d1-e1a8-4638-a8e5-c94fb2b3944e
LANGFUSE_SECRET_KEY=sk-lf-65ce3233-2537-437a-a283-739a4e5d6564
LANGFUSE_HOST=https://us.cloud.langfuse.com
```

## 6. Agent Workflow and Coordination

### 6.1 **Enhanced Invoice Processing Pipeline**
```
Invoice Data → [Evaluation Session Started]
    ↓
Item Matcher → [Performance Metrics] → [Judge Assessment]
    ↓
Price Learner → [Performance Metrics] → [Judge Assessment]
    ↓
Rule Applier → [Performance Metrics] → [Judge Assessment]
    ↓
Crew Orchestrator → [Overall Assessment] → [Recommendations]
    ↓
Final Decision + Evaluation Report
```

### 6.2 **Real-time Validation Pipeline**
```
User Submission → [Evaluation Session Started]
    ↓
Item Validator → [LLM Call via OpenRouter] → [Langfuse Tracing]
    ↓
Judge Assessment → [Performance Metrics] → [Recommendations]
    ↓
APPROVED/REJECTED/NEEDS_REVIEW + Evaluation Data
```

## 7. Performance Monitoring and Analytics

### 7.1 **Real-time Dashboards**
- **Agent Performance**: Live metrics for each agent type
- **Model Usage**: OpenRouter provider and model statistics
- **Cost Tracking**: LLM usage costs and optimization opportunities
- **Error Monitoring**: Failure rates and error patterns

### 7.2 **API Endpoints**
```
GET /api/performance?days=7&type=comprehensive
GET /api/performance?agent_type=item_matcher&days=7
GET /api/performance/evaluation/{sessionId}
GET /api/performance/metrics/history?agent_type=validator
```

### 7.3 **Automated Reporting**
- **Daily Summaries**: Agent performance trends
- **Weekly Analysis**: Model performance comparison
- **Alert System**: Performance degradation notifications
- **Improvement Recommendations**: Data-driven optimization suggestions

## 8. Current Integration Status

### ✅ **Fully Integrated**:
- **Langfuse Integration**: Complete prompt management and tracing
- **OpenRouter Integration**: Flexible model selection and fallbacks
- **Enhanced Judge System**: LLM-powered evaluation of all agents
- **Performance Monitoring**: Real-time metrics and analytics
- **API Endpoints**: Complete performance reporting infrastructure
- **Comprehensive Testing**: Integration tests validate all functionality

### 🚀 **Advanced Features Available**:
- **Multi-Provider Support**: Switch between OpenAI, Anthropic, Google, etc.
- **Cost Optimization**: Automatic model selection based on task complexity
- **Performance Analytics**: Trend analysis and improvement recommendations
- **Real-time Evaluation**: Every agent operation assessed by LLM judges
- **Automated Fallbacks**: Graceful degradation when services unavailable

## 9. Agent Execution Context

### 9.1 **Where Agents Run**:
- **Invoice Processing**: `app/api/agent_run_crew/route.ts`
- **Item Validation**: `app/api/validate_item/route.ts`
- **Performance Monitoring**: `app/api/performance/route.ts`
- **Direct Python**: `agents/crew_runner.py`

### 9.2 **Integration Points**:
- **REST API endpoints** for real-time validation and processing
- **Background job processing** for batch invoices with evaluation
- **Performance API** for analytics and monitoring
- **Langfuse dashboard** for prompt management and observability

## 10. Configuration and Environment

### 10.1 **Required Environment Variables**
```bash
# Core Agent Configuration
AGENT_ENABLED=true
AGENT_DRY_RUN=false
JUDGE_ENABLED=true
JUDGE_USE_LLM=true

# Langfuse Integration
LANGFUSE_PUBLIC_KEY=pk-lf-85f902d1-e1a8-4638-a8e5-c94fb2b3944e
LANGFUSE_SECRET_KEY=sk-lf-65ce3233-2537-437a-a283-739a4e5d6564
LANGFUSE_HOST=https://us.cloud.langfuse.com

# OpenRouter Configuration
OPENROUTER_API_KEY=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
OPENROUTER_MODEL=qwen/qwen3-30b-a3b-instruct-2507
OPENROUTER_JUDGE_MODEL=moonshotai/kimi-k2:free
OPENROUTER_FALLBACK_MODEL=google/gemma-3n-e2b-it:free

# Feature Flags
FEATURE_USE_EMBEDDINGS=true
FLAGS_AUTO_APPLY_SAFE_SYNONYMS=true
```

### 10.2 **Model Selection Strategy**
- **Cost-Effective Models**: Use free or low-cost models for standard tasks
- **Premium Models**: Reserve high-cost models for complex reasoning
- **Fallback Strategy**: Multiple tiers ensure system availability
- **Performance Optimization**: Automatic model selection based on task type

## 11. Key Differences Between Agent Types

| Aspect | Core Invoice Agents | Item Validation Agent | Judge System | Supporting Tools |
|--------|-------------------|---------------------|--------------|-----------------|
| **Purpose** | Business invoice processing | User abuse detection | Performance evaluation | Infrastructure |
| **Trigger** | Invoice submission | Real-time user input | Every agent operation | On-demand |
| **LLM Usage** | ✅ Task-optimized models | ✅ Validation-optimized | ✅ Judge-optimized | N/A |
| **Langfuse** | ✅ Full integration | ✅ Full integration | ✅ Full integration | ✅ Observability |
| **OpenRouter** | ✅ Multi-provider | ✅ Multi-provider | ✅ Multi-provider | N/A |
| **Evaluation** | ✅ Real-time | ✅ Real-time | ✅ Self-monitoring | N/A |
| **Decision Type** | ALLOW/DENY/NEEDS_MORE_INFO | APPROVED/REJECTED/NEEDS_REVIEW | Performance Scores | N/A |

## 12. Advanced Features

### 12.1 **A/B Testing Framework**
- Compare different prompts and models
- Measure performance impact of changes
- Automatic rollback for degraded performance
- Statistical significance testing

### 12.2 **Cost Optimization**
- **Smart Model Selection**: Use cheapest appropriate model
- **Usage Analytics**: Track costs by agent and operation
- **Budget Controls**: Automatic fallbacks when limits approached
- **Performance vs Cost**: Optimize for business value

### 12.3 **Extensibility**
- **New Agent Types**: Easy to add via AgentType enum
- **Custom Judges**: Create specialized evaluation criteria
- **Additional Models**: Simple OpenRouter configuration
- **Integration Points**: Standard APIs for external systems

## 13. Testing and Validation

### 13.1 **Integration Tests**
```bash
# Basic integration test
python3 test_basic_judge_integration.py

# Comprehensive test suite
python3 test_enhanced_judge_integration.py

# OpenRouter connectivity test
python3 llm/openrouter_client.py
```

### 13.2 **Test Coverage**
- ✅ System initialization and configuration
- ✅ Agent evaluation sessions and metrics
- ✅ OpenRouter model selection and fallbacks
- ✅ Langfuse integration and tracing
- ✅ Performance reporting and analytics
- ✅ End-to-end pipeline evaluation

## 14. Monitoring and Maintenance

### 14.1 **Health Checks**
- **System Status**: All components operational
- **Model Availability**: OpenRouter service health
- **Langfuse Connectivity**: Observability system status
- **Performance Baselines**: Agent efficiency metrics

### 14.2 **Operational Excellence**
- **Automated Alerts**: Performance degradation notifications
- **Capacity Planning**: Usage trends and scaling requirements
- **Security Monitoring**: API key rotation and access control
- **Compliance Tracking**: Audit trails and decision logging

---

**🎉 The agent architecture now provides enterprise-grade invoice verification with comprehensive LLM integration, real-time evaluation, and flexible model selection across multiple providers via OpenRouter and Langfuse.**