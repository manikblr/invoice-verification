# Invoice Verification System

AI-powered invoice verification system with human-in-the-loop feedback and automated learning.

## Features

- **Agent Pipeline**: CrewAI-based agents for item matching, pricing analysis, and rule application
- **Human Feedback**: Interactive approval system for agent proposals
- **Observability**: Langfuse integration for tracing and monitoring
- **Model Routing**: OpenRouter integration for hosted AI model access
- **Data Management**: Seeding system for canonical items, synonyms, and vendor catalogs
- **Judge System**: Automated evaluation of agent decisions

## Quick Start

1. **Environment Setup**
   ```bash
   cp .env.example .env
   # Configure your Supabase and API keys
   ```

2. **Install Dependencies**
   ```bash
   npm install
   pip install -r requirements.txt
   ```

3. **Development Server**
   ```bash
   npm run dev
   ```

## Operations

### Cron Jobs (Global Kill-Switch)

We gate all cron-like endpoints behind a single environment flag:

- **Flag:** `CRON_ENABLED` (boolean)
- **Default:** `false` (jobs paused)

When `CRON_ENABLED=false`, cron endpoints exit immediately with **HTTP 503** and stable JSON:
```json
{
  "error": "CRON_DISABLED",
  "message": "Cron jobs are paused. Set CRON_ENABLED=true to enable.",
  "hint": "Flip the env var and redeploy."
}
```

**Scheduled Jobs:**
- `/api/relearn` - Nightly price band updates (03:00 IST)
- `/api/safety_scan` - Data integrity checks (03:30 IST)

**Control:**
```bash
# Enable cron jobs
export CRON_ENABLED=true

# Disable cron jobs (default)
export CRON_ENABLED=false
```

## Testing

```bash
# Run unit tests
npm test

# Run Python tests
python -m pytest tests/

# Test cron endpoints
curl -X GET "http://localhost:3000/api/relearn"
curl -X GET "http://localhost:3000/api/safety_scan"
```

## Offline Evaluation

The offline evaluator computes agent performance metrics against golden truth labels from stored evaluation runs.

### Usage

```bash
# Set database connection
export DATABASE_URL="postgresql://user:pass@localhost/db"

# Run evaluation against latest completed run
python tools/eval_offline.py run --dataset demo --run-id latest --out eval/results

# Run evaluation against specific run ID  
python tools/eval_offline.py run --dataset demo --run-id run_12345 --out eval/results

# Run unit tests for metrics functions
python -m pytest tools/tests/test_metrics.py
```

### Output Files

**`eval/results/summary.json`** - Overall metrics and metadata:
```json
{
  "dataset": "demo",
  "run_id": "run_12345", 
  "timestamp": "2024-01-15T10:30:00",
  "total_lines": 100,
  "policy_accuracy": 0.85,
  "policy_metrics": {
    "precision": 0.83,
    "recall": 0.82, 
    "f1": 0.82
  },
  "item_matching": {
    "hit_at_1": 0.75,
    "hit_at_3": 0.89,
    "hit_at_5": 0.94,
    "mean_reciprocal_rank": 0.81
  }
}
```

**`eval/results/by_line.csv`** - Per-line evaluation details with columns:
- `line_id`, `gold_policy`, `pred_policy`, `policy_correct`
- `gold_item_id`, `pred_item_id` 
- `hit_at_1`, `hit_at_3`, `hit_at_5`, `mrr`
- `judge_*` scores (if available)
- `notes` for any issues

### Metrics

**Policy Classification:**
- **Accuracy**: Fraction of correct policy predictions
- **Macro F1**: Macro-averaged precision, recall, F1 across {ALLOW, DENY, NEEDS_MORE_INFO}

**Item Matching:**
- **Hit@K**: Fraction where gold canonical item appears in top-K candidates
- **MRR**: Mean Reciprocal Rank of gold item in candidate rankings

**Notes:**
- Hit@3/5/MRR require stored candidate rankings from agent decisions
- When no candidates available, only Hit@1 computed from exact canonical match
- Missing data handled gracefully with null values and clear documentation

## Environment Matrix

| Variable | Dev | Staging (Preview) | Production | Notes |
|----------|-----|-------------------|------------|-------|
| `DATABASE_URL` | Required | Required | Required | PostgreSQL connection string |
| `CRON_ENABLED` | `false` | `false` | `false` | Keep disabled by default |
| `FEATURE_USE_EMBEDDINGS` | `false` | `false` | `false` | AI embedding features |
| `FLAGS_AUTO_APPLY_SAFE_SYNONYMS` | `false` | `false` | `false` | Auto-apply synonym proposals |
| `NEXT_PUBLIC_LANGFUSE_URL` | Optional | Optional | Optional | Public observability URL |
| `LANGFUSE_PUBLIC_KEY` | Optional | Required | Required | Observability tracing |
| `OPENROUTER_API_KEY` | Optional | Required | Required | Hosted LLM router API key |
| `FEEDBACK_API_KEY` | - | - | - | Disabled for experimental use |

## Vercel Setup (Auto-deploy)

1. **Environment Variables**: In Vercel Dashboard → Settings → Environment Variables:
   - Set variables for **Preview** (Staging) and **Production** environments
   - Ensure `CRON_ENABLED=false` in both environments
   - Authentication disabled for experimental use

2. **Branch Deployment**:
   - Push to `staging` branch → Staging (Preview) deploy
   - Push/merge to `main` branch → Production deploy

3. **Verify Health Endpoints**:
   - Check `/api/health` returns 200 with environment info
   - Check `/api/cron_status` shows `cron_enabled: false`

## On-call Runbook

### Enable Cron Jobs (Staging Only)
1. In Vercel: Set `CRON_ENABLED=true` for Preview environment
2. Redeploy staging branch
3. Verify: `curl https://your-staging.vercel.app/api/cron_status`
4. Run smoke checks (see below)
5. **Important**: Set `CRON_ENABLED=false` and redeploy when done

### Rollback Procedure
- In Vercel Dashboard: Redeploy previous successful build
- Environment variables remain authoritative (no code changes needed)

## Smoke Checks

Copy-paste commands for deployment verification:

```bash
# Replace $BASE_URL with your deployment URL
BASE_URL="https://your-app.vercel.app"

# Health check
curl $BASE_URL/api/health
# Expected: {"ok":true,"env":"preview|production","version":"<sha>"}

# Cron status
curl $BASE_URL/api/cron_status  
# Expected: {"cron_enabled":false}

# Feedback API (no authentication required for experimental use)
curl -X POST -H "Content-Type: application/json" -d '{"lineId":"test","action":"APPROVE"}' $BASE_URL/api/feedback
# Expected: 200 Success
```

## API Security

### Feedback API
**Authentication disabled for experimental use:**
- `/api/feedback` endpoint accepts requests without authentication
- No API keys required
- Suitable for development and testing

### Health Endpoints
- `/api/health` and `/api/cron_status` are publicly accessible
- Do not expose sensitive information or database status
- Safe for monitoring and deployment verification

**Note**: Staging environment uses Vercel's "Preview" deployment system.

## Architecture

- **Frontend**: Next.js with React components
- **Backend**: Python agents + Next.js API routes
- **Database**: Supabase/PostgreSQL
- **AI**: CrewAI + OpenRouter
- **Observability**: Langfuse tracing