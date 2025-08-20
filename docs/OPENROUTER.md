# OpenRouter Integration Guide

This guide explains how to set up and use OpenRouter as a hosted LLM service for the invoice verification system.

## Overview

OpenRouter provides a hosted API that routes requests to multiple LLM providers (Anthropic, OpenAI, Google, etc.) with OpenAI-compatible interfaces. It offers free credits for experimentation and a web interface for usage management.

## Quick Start

### 1. Get OpenRouter API Key

1. Visit [OpenRouter.ai](https://openrouter.ai/)
2. Sign up for an account
3. Get your API key from the dashboard
4. You'll receive free credits for experimentation

### 2. Set Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# OpenRouter Configuration (hosted LLM router with free credits)
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_key_here
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

### 3. Enable LLM Usage

Set environment variables to enable LLM features:

```bash
export JUDGE_USE_LLM=true
```

## Configuration

### Available Models

OpenRouter supports many models with their full provider paths:

- `anthropic/claude-3.5-sonnet` (default)
- `anthropic/claude-3-haiku`
- `openai/gpt-4o-mini`
- `openai/gpt-4o`
- `google/gemini-1.5-flash`
- `meta-llama/llama-3.1-70b-instruct`

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Yes | - | Your OpenRouter API key |
| `OPENROUTER_MODEL` | No | `anthropic/claude-3.5-sonnet` | Model to use for requests |

## Usage in Code

### Basic Usage

```python
from llm.client import get_llm

# Get client
llm_client = get_llm()

# Check availability
if llm_client.is_available():
    # Make request
    response = llm_client.chat_completion(
        messages=[
            {"role": "user", "content": "Hello!"}
        ],
        model="anthropic/claude-3.5-sonnet"  # Optional override
    )
```

### Current Integrations

#### ExplanationJudge

When `JUDGE_USE_LLM=true`, the ExplanationJudge uses OpenRouter to score explanation quality:

```python
# Automatically switches to LLM when enabled
explanation_judge = ExplanationJudge(supabase_tool)
score = explanation_judge.score_explanation(
    "Price exceeds maximum threshold", 
    ["PRICE_EXCEEDS_MAX_150"]
)
```

The judge:
1. Checks if OpenRouter is available
2. Creates a scoring prompt with criteria
3. Calls the configured model via OpenRouter
4. Extracts numeric score (0.0-1.0)
5. Falls back to heuristics on error

## Monitoring

### Usage Dashboard

OpenRouter provides a web dashboard to monitor:
- API usage and costs
- Model performance
- Request history
- Credit balance

### Health Check

```python
from llm.client import health_check

status = health_check()
print(status)
# {
#   'openrouter_api_key': 'set',
#   'model': 'anthropic/claude-3.5-sonnet',
#   'base_url': 'https://openrouter.ai/api/v1',
#   'client_available': True,
#   'initialized': True
# }
```

## Troubleshooting

### Common Issues

1. **"OpenRouter client not available"**
   - Check `OPENROUTER_API_KEY` is set correctly
   - Verify your API key is valid
   - Ensure you have available credits

2. **"Model not found"**  
   - Check the model name format (must include provider prefix)
   - Verify the model is supported by OpenRouter
   - Some models may require additional permissions

3. **Rate limiting**
   - OpenRouter enforces rate limits per model
   - Free tier has lower limits than paid plans
   - Check the dashboard for current limits

### Debug Mode

Enable debug logging to troubleshoot issues:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Fallback Behavior

The system gracefully handles OpenRouter failures:
- ExplanationJudge falls back to heuristic scoring
- Errors are logged but don't break the pipeline
- Judge system continues with other scoring methods

## Security

- API keys are never logged or exposed in responses
- Requests are sent over HTTPS to OpenRouter
- Use environment variables for API key storage
- OpenRouter doesn't store request/response data by default

## Performance

- OpenRouter adds minimal latency (~50-100ms)
- No local infrastructure required
- Automatic load balancing across providers
- Built-in retry logic and failover

## Cost Management

- Monitor usage through OpenRouter dashboard
- Set up usage alerts and limits
- Free tier provides substantial credits for experimentation
- Transparent pricing per model and request

## Migration from LiteLLM

This system has been migrated from LiteLLM to OpenRouter for the following benefits:

1. **No Self-Hosting**: No need to run and maintain a local proxy
2. **Free Credits**: OpenRouter provides free credits for experimentation  
3. **Web Interface**: Easy monitoring and management through dashboard
4. **Better Reliability**: Hosted service with built-in redundancy
5. **Simplified Setup**: Just need an API key, no complex configuration