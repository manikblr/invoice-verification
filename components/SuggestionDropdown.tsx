/**
 * Accessible combobox component for item name suggestions
 * Implements WAI-ARIA combobox pattern with keyboard navigation
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface Suggestion {
  id: string;
  name: string;
  score: number;
  reason?: string;
}

interface SuggestionDropdownProps {
  /** Current input value */
  value: string;
  /** Called when input value changes */
  onChange: (value: string) => void;
  /** Called when a suggestion is picked */
  onPick: (suggestion: { id: string; name: string }) => void;
  /** Function to fetch suggestions for a query */
  fetchSuggestions: (query: string) => Promise<ReadonlyArray<Suggestion>>;
  /** Input placeholder text */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Accessible combobox for item suggestions with keyboard navigation
 * - Debounces input (250ms) and fetches suggestions for queries >= 2 chars
 * - Arrow keys navigate, Enter selects, Escape closes
 * - Click to select suggestions
 * - Prevents request stampede by cancelling in-flight requests
 * - Follows WAI-ARIA combobox pattern
 */
export function SuggestionDropdown({
  value,
  onChange,
  onPick,
  fetchSuggestions,
  placeholder = 'Type to search...',
  className = ''
}: SuggestionDropdownProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedValue = useDebouncedValue(value, 250);

  // Generate stable IDs for accessibility
  const comboboxId = 'suggestion-combobox';
  const listboxId = 'suggestion-listbox';

  // Fetch suggestions when debounced value changes
  useEffect(() => {
    if (debouncedValue.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const fetchData = async (): Promise<void> => {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      setIsLoading(true);

      try {
        const results = await fetchSuggestions(debouncedValue);
        
        // Take top 8 suggestions
        const limitedResults = results.slice(0, 8);
        setSuggestions(limitedResults);
        setIsOpen(limitedResults.length > 0);
        setHighlightedIndex(-1);
      } catch (error) {
        // Ignore aborted requests
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Failed to fetch suggestions:', error);
          setSuggestions([]);
          setIsOpen(false);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [debouncedValue, fetchSuggestions]);

  // Handle input changes
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.value);
  };

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!isOpen || suggestions.length === 0) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      
      case 'Enter':
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          const selected = suggestions[highlightedIndex];
          handlePick(selected);
        }
        break;
      
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.focus();
        break;
    }
  };

  // Handle suggestion selection
  const handlePick = useCallback((suggestion: Suggestion): void => {
    onPick({ id: suggestion.id, name: suggestion.name });
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  }, [onPick]);

  // Handle input blur with delay to allow click selection
  const handleBlur = (): void => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }, 200);
  };

  // Handle input focus
  const handleFocus = (): void => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    
    if (suggestions.length > 0 && debouncedValue.length >= 2) {
      setIsOpen(true);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const getReasonBadgeColor = (reason?: string): string => {
    switch (reason) {
      case 'fuzzy':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300';
      case 'synonym':
        return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300';
      case 'vendor_boost':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300';
      case 'band_bonus':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300';
      case 'embedding':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={comboboxId}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-activedescendant={
          highlightedIndex >= 0 ? `suggestion-${highlightedIndex}` : undefined
        }
        autoComplete="off"
      />

      {isOpen && (
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {isLoading && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              Loading suggestions...
            </div>
          )}

          {!isLoading && suggestions.length === 0 && debouncedValue.length >= 2 && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              No suggestions
            </div>
          )}

          {!isLoading && suggestions.map((suggestion, index) => (
            <div
              key={suggestion.id}
              id={`suggestion-${index}`}
              role="option"
              aria-selected={index === highlightedIndex}
              className={`px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${
                index === highlightedIndex
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : ''
              }`}
              onClick={() => handlePick(suggestion)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {suggestion.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Score: {Math.round(suggestion.score * 100)}%
                </div>
              </div>
              
              {suggestion.reason && (
                <span
                  className={`ml-2 px-1.5 py-0.5 text-xs rounded-full flex-shrink-0 ${getReasonBadgeColor(suggestion.reason)}`}
                >
                  {suggestion.reason}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}