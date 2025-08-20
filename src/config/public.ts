/**
 * Public configuration accessible in client-side code
 * Only includes environment variables prefixed with NEXT_PUBLIC_
 */

/**
 * Public configuration object
 * Safe to use in client-side components and API calls
 */
export const PUBLIC_CFG = {
  /** Langfuse public URL for trace links and observability */
  langfuseUrl: process.env.NEXT_PUBLIC_LANGFUSE_URL ?? '',
} as const;

/**
 * Type definition for public configuration
 */
export type PublicConfig = typeof PUBLIC_CFG;