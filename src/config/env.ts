/**
 * Environment variables validation using Zod
 * Centralizes all env var parsing with type safety
 */

import { z } from 'zod';

const envSchema = z.object({
  // Supabase Configuration
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  
  // Langfuse Observability
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().url().optional(),
  
  // Agent Configuration
  AGENT_ENABLED: z.string().transform(val => val === 'true').default('true'),
  AGENT_DRY_RUN: z.string().transform(val => val === 'true').default('true'),
  ALLOW_APPROVE_IN_DRY_RUN: z.string().transform(val => val === 'true').default('false'),
  
  // Judge Configuration
  JUDGE_ENABLED: z.string().transform(val => val === 'true').default('true'),
  JUDGE_USE_LLM: z.string().transform(val => val === 'true').default('false'),
  
  // OpenRouter Configuration (hosted LLM router)
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-3.5-sonnet'),
  
  // Cron Jobs Configuration
  CRON_ENABLED: z.string().transform(val => val === 'true').default('false'),
  
  // Feature Flags
  FEATURE_USE_EMBEDDINGS: z.string().transform(val => val === 'true').default('false'),
  FLAGS_AUTO_APPLY_SAFE_SYNONYMS: z.string().transform(val => val === 'true').default('false'),
  
  // Production API Security (disabled for experimental use)
  // FEEDBACK_API_KEY: z.string().optional(),
});

/**
 * Parsed and validated environment variables
 * Use this instead of process.env for type safety
 */
export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;