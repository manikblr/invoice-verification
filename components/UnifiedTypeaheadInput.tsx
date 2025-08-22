'use client'

import { useState, useEffect, useRef } from 'react'

interface UnifiedTypeaheadInputProps {
  value: string
  onChange: (value: string) => void
  onSelect: (label: string, kind?: string) => void
  serviceLineId?: number
  serviceTypeId?: number
  placeholder?: string
  className?: string
}

interface SuggestionItem {
  id: string
  name: string
  score: number
  reason: string
  kind?: 'material' | 'equipment'
  service_line?: string
  vendors?: Array<{
    vendor_id: string
    vendor_name: string
  }>
}

export default function UnifiedTypeaheadInput({
  value,
  onChange,
  onSelect,
  serviceLineId,
  serviceTypeId,
  placeholder = "Search materials or equipment...",
  className = ""
}: UnifiedTypeaheadInputProps) {
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
      })
      
      // Add service context for better suggestions
      if (serviceLineId) params.append('serviceLineId', serviceLineId.toString())
      if (serviceTypeId) params.append('serviceTypeId', serviceTypeId.toString())

      const response = await fetch(`/api/suggest_items?${params}`)
      const data = await response.json()
      
      if (data.suggestions && Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions)
        setShowDropdown(data.suggestions.length > 0)
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
    onSelect(suggestion.name, suggestion.kind)
    onChange(suggestion.name)
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

  const getKindIcon = (kind?: string) => {
    switch (kind) {
      case 'material':
        return '🧱' // Material icon
      case 'equipment':
        return '🔧' // Equipment icon
      default:
        return '📦' // General item icon
    }
  }

  const getKindBadge = (kind?: string) => {
    switch (kind) {
      case 'material':
        return (
          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
            Material
          </span>
        )
      case 'equipment':
        return (
          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
            Equipment
          </span>
        )
      default:
        return null
    }
  }

  const getReasonBadge = (reason: string) => {
    const badges = {
      'fuzzy': { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Match' },
      'synonym': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Synonym' },
      'popular': { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Popular' },
      'vendor_boost': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Vendor' },
      'service_line_bonus': { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Service' },
      'equipment_boost': { bg: 'bg-green-100', text: 'text-green-700', label: 'Equipment' }
    }
    
    const badge = badges[reason as keyof typeof badges] || badges['fuzzy']
    
    return (
      <span className={`inline-block px-1.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text} rounded`}>
        {badge.label}
      </span>
    )
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
        className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        autoComplete="off"
        data-testid="unified-typeahead-input"
      />
      
      {isLoading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      )}

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto" data-testid="unified-suggestions-dropdown">
          {suggestions.slice(0, 10).map((suggestion, index) => (
            <div
              key={`${suggestion.id}-${index}`}
              onClick={() => handleSuggestionClick(suggestion)}
              className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
              data-testid="unified-suggestion-item"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 flex-1">
                  <span className="text-lg">{getKindIcon(suggestion.kind)}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{suggestion.name}</div>
                    {suggestion.service_line && (
                      <div className="text-xs text-gray-500">in {suggestion.service_line}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {getKindBadge(suggestion.kind)}
                  {getReasonBadge(suggestion.reason)}
                  <div className="text-xs text-gray-400">
                    {Math.round(suggestion.score * 100)}%
                  </div>
                </div>
              </div>
              {suggestion.vendors && suggestion.vendors.length > 0 && (
                <div className="mt-1 text-xs text-gray-500">
                  Available from: {suggestion.vendors.slice(0, 2).map(v => v.vendor_name).join(', ')}
                  {suggestion.vendors.length > 2 && ` +${suggestion.vendors.length - 2} more`}
                </div>
              )}
            </div>
          ))}
          
          {/* No results message with helpful suggestions */}
          {suggestions.length === 0 && value.length >= 2 && !isLoading && (
            <div className="px-4 py-6 text-center text-gray-500">
              <div className="text-sm">No results found for "{value}"</div>
              <div className="text-xs mt-1">
                Try searching for:
                <ul className="mt-2 space-y-1">
                  <li>• General terms (e.g., "pipe", "wrench", "valve")</li>
                  <li>• Material names (e.g., "copper", "steel", "PVC")</li>
                  <li>• Equipment types (e.g., "drill", "pump", "meter")</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}