'use client'

import { useState, useEffect, useRef } from 'react'

interface TypeaheadInputProps {
  value: string
  onChange: (value: string) => void
  onSelect: (label: string) => void
  kind: 'material' | 'equipment'
  serviceLineId?: number
  serviceTypeId?: number
  placeholder?: string
  className?: string
}

interface SuggestionItem {
  canonical_id: string
  label: string
  synonym?: string
  source: 'name' | 'synonym'
}

export default function TypeaheadInput({
  value,
  onChange,
  onSelect,
  kind,
  serviceLineId,
  serviceTypeId,
  placeholder = "Type to search...",
  className = ""
}: TypeaheadInputProps) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout>()
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchSuggestions = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        q: query,
        kind: kind
      })
      if (serviceLineId) params.append('service_line_id', serviceLineId.toString())
      if (serviceTypeId) params.append('service_type_id', serviceTypeId.toString())

      const response = await fetch(`/api/suggest?${params}`)
      const data = await response.json()
      
      if (data.ok && data.items) {
        setSuggestions(data.items)
        setShowDropdown(data.items.length > 0)
      } else {
        setSuggestions([])
        setShowDropdown(false)
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error)
      setSuggestions([])
      setShowDropdown(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)

    // Debounce API calls
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue)
    }, 250)
  }

  const handleSuggestionClick = (suggestion: SuggestionItem) => {
    onSelect(suggestion.label)
    onChange(suggestion.label)
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  const handleInputBlur = () => {
    // Delay hiding dropdown to allow clicks
    setTimeout(() => {
      setShowDropdown(false)
    }, 200)
  }

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowDropdown(true)
    }
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onFocus={handleInputFocus}
        placeholder={placeholder}
        className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        autoComplete="off"
      />
      
      {isLoading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      )}

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {suggestions.slice(0, 8).map((suggestion, index) => (
            <div
              key={`${suggestion.canonical_id}-${index}`}
              onClick={() => handleSuggestionClick(suggestion)}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <div className="text-sm text-gray-900">{suggestion.label}</div>
              {suggestion.synonym && (
                <div className="text-xs text-gray-500">matches: {suggestion.synonym}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}