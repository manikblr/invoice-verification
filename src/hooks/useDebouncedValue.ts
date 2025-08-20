/**
 * Hook for debouncing rapid value changes
 * Useful for search inputs to avoid excessive API calls
 */

'use client';

import { useEffect, useState } from 'react';

/**
 * Debounces a value change by the specified delay
 * - Returns the original value immediately on first render
 * - Subsequent changes are delayed by the specified time
 * - Cancels pending updates if value changes again
 * 
 * @param value - The value to debounce
 * @param delayMs - Delay in milliseconds before updating
 * @returns The debounced value
 * 
 * @example
 * ```tsx
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedQuery = useDebouncedValue(searchQuery, 250);
 * 
 * useEffect(() => {
 *   if (debouncedQuery.length >= 2) {
 *     fetchSuggestions(debouncedQuery);
 *   }
 * }, [debouncedQuery]);
 * ```
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up a timeout to update the debounced value
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    // Cancel the timeout if value changes before delay
    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, delayMs]);

  return debouncedValue;
}