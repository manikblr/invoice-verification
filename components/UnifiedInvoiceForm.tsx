'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { validateInvoiceEnhanced } from '../lib/transparency-api'
import { MetaResponse, ServiceType } from '../lib/types'
import { EnhancedValidationResponse } from '../lib/types/transparency'
import EnhancedLineItemsTable from './EnhancedLineItemsTable'
import UnifiedTypeaheadInput from './UnifiedTypeaheadInput'
import CurrencyInput from './CurrencyInput'
import { InlineInfoRequest, InfoIcon } from './InlineInfoRequest'

interface LineItem {
  name: string
  quantity: number
  unit: string
  unit_price: number
  kind?: 'material' | 'equipment' // Auto-detected from search
  needsInfo?: boolean // Whether this item needs additional information
  infoExplanation?: string // User-provided explanation
  validationStatus?: 'ALLOW' | 'NEEDS_REVIEW' | 'REJECT' | 'ERROR' // Inline validation status
  validationReason?: string // Brief reason for the status
  validationConfidence?: number // Confidence score 0-1
}

interface UnifiedInvoiceFormData {
  scope_of_work: string
  service_line_id: number
  service_type_id: number
  labor_hours: number
  items: LineItem[]
}

export default function UnifiedInvoiceForm() {
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [filteredServiceTypes, setFilteredServiceTypes] = useState<ServiceType[]>([])
  // Standard validation removed - only enhanced validation is used
  const [enhancedResult, setEnhancedResult] = useState<EnhancedValidationResponse | null>(null)
  // Enhanced validation is now the default and only option
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Inline info request state
  const [infoRequest, setInfoRequest] = useState<{
    isOpen: boolean
    itemIndex: number | null
    isSubmitting: boolean
  }>({ isOpen: false, itemIndex: null, isSubmitting: false })

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<UnifiedInvoiceFormData>({
    defaultValues: {
      scope_of_work: '',
      service_line_id: 0,
      service_type_id: 0,
      labor_hours: 0,
      items: [{ name: '', quantity: 1, unit: 'pcs', unit_price: 0, needsInfo: false }],
    }
  })

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control,
    name: 'items'
  })

  const selectedServiceLineId = watch('service_line_id')

  useEffect(() => {
    // Fetch live taxonomy data
    fetch('/api/taxonomy')
      .then(res => res.json())
      .then(data => {
        if (data && data.service_lines && data.service_types) {
          setMeta(data)
        } else {
          console.warn('Invalid taxonomy data received:', data)
          setMeta({
            ok: true,
            service_lines: [],
            service_types: []
          })
        }
      })
      .catch(err => {
        console.error('Failed to fetch taxonomy:', err)
        setMeta({
          ok: true,
          service_lines: [],
          service_types: []
        })
      })
  }, [])

  useEffect(() => {
    if (meta && selectedServiceLineId && selectedServiceLineId !== 0) {
      const serviceTypeGroup = meta.service_types.find(
        group => group.service_line_id === selectedServiceLineId
      )
      const filteredTypes = serviceTypeGroup?.types || []
      setFilteredServiceTypes(filteredTypes)
      setValue('service_type_id', 0)
      
      // Debug logging in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Service line changed:', selectedServiceLineId)
        console.log('Available service types:', filteredTypes.map(t => t.name))
      }
    } else {
      setFilteredServiceTypes([])
    }
  }, [selectedServiceLineId, meta, setValue])

  const onSubmit = async (data: UnifiedInvoiceFormData) => {
    setIsSubmitting(true)
    setEnhancedResult(null)
    try {
      // Filter out blank item names
      const validItems = data.items.filter(item => (item.name || '').trim() !== '')
      
      // Always use enhanced validation (now the default and only option)
      const enhancedPayload = {
        scopeOfWork: data.scope_of_work,
        serviceLineId: data.service_line_id,
        serviceTypeId: data.service_type_id,
        laborHours: data.labor_hours,
        items: validItems.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          unit: item.unit,
          type: (item.kind === 'material' ? 'material' : 
                item.kind === 'equipment' ? 'equipment' : 'labor') as 'material' | 'equipment' | 'labor'
        })),
        includeAgentTraces: true,
        includeDetailedExplanations: true,
        explanationLevel: 2 as const
      }
      
      const enhancedResponse = await validateInvoiceEnhanced(enhancedPayload)
      setEnhancedResult(enhancedResponse)
      
      // Update inline validation status for each item
      enhancedResponse.lines.forEach((line, index) => {
        if (index < validItems.length) {
          setValue(`items.${index}.validationStatus`, line.status)
          setValue(`items.${index}.validationReason`, line.explanation?.summary || 'Validated')
          setValue(`items.${index}.validationConfidence`, line.confidenceScore)
          
          // Set needsInfo if the item needs review
          if (line.status === 'NEEDS_REVIEW') {
            setValue(`items.${index}.needsInfo`, true)
          }
        }
      })
    } catch (error) {
      console.error('Validation failed:', error)
      alert(`Failed to validate invoice: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleItemSelect = (index: number, itemName: string, kind?: string) => {
    setValue(`items.${index}.name`, itemName)
    if (kind) {
      setValue(`items.${index}.kind`, kind as 'material' | 'equipment')
    }
  }

  const getItemKindIcon = (kind?: string) => {
    switch (kind) {
      case 'material': return '🧱'
      case 'equipment': return '🔧'
      default: return '📦'
    }
  }

  const getItemKindBadge = (kind?: string) => {
    if (!kind) return null
    
    const styles = {
      material: 'bg-blue-100 text-blue-800',
      equipment: 'bg-green-100 text-green-800'
    }
    
    return (
      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${styles[kind]}`}>
        {kind.charAt(0).toUpperCase() + kind.slice(1)}
      </span>
    )
  }

  const getValidationStatusBadge = (status?: string, confidence?: number) => {
    if (!status) return null
    
    const styles = {
      'ALLOW': 'bg-green-100 text-green-800 border-green-200',
      'NEEDS_REVIEW': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'REJECT': 'bg-red-100 text-red-800 border-red-200',
      'ERROR': 'bg-gray-100 text-gray-800 border-gray-200'
    }
    
    const icons = {
      'ALLOW': '✅',
      'NEEDS_REVIEW': '⚠️',
      'REJECT': '❌',
      'ERROR': '❓'
    }
    
    const labels = {
      'ALLOW': 'Approved',
      'NEEDS_REVIEW': 'Needs Review',
      'REJECT': 'Rejected',
      'ERROR': 'Error'
    }
    
    return (
      <div className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded border ${styles[status as keyof typeof styles]}`}>
        <span className="mr-1">{icons[status as keyof typeof icons]}</span>
        <span>{labels[status as keyof typeof labels]}</span>
        {confidence && (
          <span className="ml-1 text-xs opacity-75">
            ({Math.round(confidence * 100)}%)
          </span>
        )}
      </div>
    )
  }

  // Handler for opening info request modal
  const handleInfoRequest = (itemIndex: number) => {
    setInfoRequest({
      isOpen: true,
      itemIndex,
      isSubmitting: false
    })
  }

  // Handler for closing info request modal
  const handleCloseInfoRequest = () => {
    setInfoRequest({
      isOpen: false,
      itemIndex: null,
      isSubmitting: false
    })
  }

  // Handler for submitting additional info
  const handleSubmitInfo = async (explanation: string) => {
    if (infoRequest.itemIndex === null) return

    setInfoRequest(prev => ({ ...prev, isSubmitting: true }))

    try {
      // Update the item with the provided explanation
      setValue(`items.${infoRequest.itemIndex}.infoExplanation`, explanation)
      setValue(`items.${infoRequest.itemIndex}.needsInfo`, false)
      
      // Here you could also make an API call to submit the explanation
      // await submitItemExplanation(infoRequest.itemIndex, explanation)
      
      handleCloseInfoRequest()
    } catch (error) {
      console.error('Failed to submit explanation:', error)
      // You could show an error toast here
    } finally {
      setInfoRequest(prev => ({ ...prev, isSubmitting: false }))
    }
  }

  // Handler for re-validating a single item with additional context
  const revalidateItem = async (itemIndex: number) => {
    const currentItem = watch(`items.${itemIndex}`)
    const explanation = currentItem?.infoExplanation
    
    if (!currentItem || !explanation?.trim()) {
      alert('Please provide additional context before re-validating.')
      return
    }

    setIsSubmitting(true)
    
    try {
      // Create payload for single item re-validation with context
      const formData = watch()
      const enhancedPayload = {
        scopeOfWork: formData.scope_of_work,
        serviceLineId: formData.service_line_id,
        serviceTypeId: formData.service_type_id,
        laborHours: formData.labor_hours,
        items: [{
          name: currentItem.name,
          quantity: currentItem.quantity,
          unitPrice: currentItem.unit_price,
          unit: currentItem.unit,
          type: (currentItem.kind === 'material' ? 'material' : 
                currentItem.kind === 'equipment' ? 'equipment' : 'labor') as 'material' | 'equipment' | 'labor',
          additionalContext: explanation // Pass the user's explanation as additional context
        }],
        includeAgentTraces: true,
        includeDetailedExplanations: true,
        explanationLevel: 2 as const
      }
      
      const enhancedResponse = await validateInvoiceEnhanced(enhancedPayload)
      
      // Update the inline status for this specific item
      if (enhancedResponse.lines.length > 0) {
        const line = enhancedResponse.lines[0]
        setValue(`items.${itemIndex}.validationStatus`, line.status)
        setValue(`items.${itemIndex}.validationReason`, line.explanation?.summary || 'Re-validated with context')
        setValue(`items.${itemIndex}.validationConfidence`, line.confidenceScore)
        
        // Clear needsInfo if the item is now approved
        if (line.status === 'ALLOW') {
          setValue(`items.${itemIndex}.needsInfo`, false)
        }
      }
      
    } catch (error) {
      console.error('Re-validation failed:', error)
      alert(`Failed to re-validate item: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Simulate agent decision that requires info (for demo purposes)
  const simulateNeedsInfo = (itemIndex: number) => {
    const currentItem = watch(`items.${itemIndex}`)
    // Simulate some logic that determines an item needs more info
    // For demo: if item name contains "industrial" or price > $1000
    return currentItem?.name && (
      currentItem.name.toLowerCase().includes('industrial') || 
      (currentItem.unit_price && currentItem.unit_price > 1000)
    )
  }

  // Handle keyboard shortcuts for adding items
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to add new item
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        appendItem({ name: '', quantity: 1, unit: 'pcs', unit_price: 0, needsInfo: false })
        // Smooth scroll and focus logic
        setTimeout(() => {
          const newIndex = itemFields.length
          const newItemElement = document.querySelector(`[data-item-index="${newIndex}"]`)
          if (newItemElement) {
            newItemElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            const nameInput = newItemElement.querySelector('input[placeholder*="Search materials"]')
            if (nameInput) {
              (nameInput as HTMLInputElement).focus()
            }
          }
        }, 100)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [itemFields.length, appendItem])

  if (!meta) {
    return <div className="text-center">Loading...</div>
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md" data-testid="unified-invoice-form">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Invoice Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scope of Work <span className="text-red-500">*</span>
            </label>
            <input
              {...register('scope_of_work', { 
                required: 'Scope of work is required',
                validate: (value) => value?.trim() ? true : 'Scope of work cannot be empty'
              })}
              className={`w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.scope_of_work ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Describe the work to be done"
            />
            {errors.scope_of_work && (
              <p className="mt-1 text-sm text-red-500">{errors.scope_of_work.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Labor Hours
            </label>
            <input
              type="number"
              step="0.1"
              {...register('labor_hours', { valueAsNumber: true })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service Line
            </label>
            <select
              {...register('service_line_id', { valueAsNumber: true })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={0}>Select Service Line</option>
              {(meta?.service_lines || []).map(line => (
                <option key={line.id} value={line.id}>{line.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service Type
            </label>
            <select
              {...register('service_type_id', { valueAsNumber: true })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!selectedServiceLineId}
            >
              <option value={0}>Select Service Type</option>
              {(filteredServiceTypes || []).map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Unified Items Section */}
        <div>
          <div className="mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Materials & Equipment</h3>
              <p className="text-sm text-gray-500 mt-1">
                Search for any materials or equipment - the system will automatically categorize them
                <span className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded border">
                  💡 Tip: Press <kbd className="font-mono text-xs">Ctrl+Enter</kbd> to add new item
                </span>
              </p>
            </div>
          </div>
          
          <div className="space-y-3">
            {itemFields.map((field, index) => {
              const currentItem = watch(`items.${index}`)
              return (
                <div key={field.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50" data-item-index={index}>
                  {/* Item Number Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-700">Item #{index + 1}</span>
                    </div>
                    {itemFields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                      >
                        × Remove
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-end">
                    {/* Item Name Search */}
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <div className="flex items-center space-x-1">
                          <span>Item Name</span>
                          <InfoIcon
                            needsInfo={simulateNeedsInfo(index)}
                            onClick={() => handleInfoRequest(index)}
                          />
                        </div>
                      </label>
                      <UnifiedTypeaheadInput
                        value={watch(`items.${index}.name`) || ''}
                        onChange={(value) => setValue(`items.${index}.name`, value)}
                        onSelect={(label, kind) => handleItemSelect(index, label, kind)}
                        serviceLineId={selectedServiceLineId || undefined}
                        serviceTypeId={watch('service_type_id') || undefined}
                        placeholder="Search materials or equipment..."
                      />
                      <div className="mt-1 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {currentItem?.kind && (
                            <>
                              <span className="text-sm">{getItemKindIcon(currentItem.kind)}</span>
                              {getItemKindBadge(currentItem.kind)}
                            </>
                          )}
                          {/* Inline Validation Status */}
                          {currentItem?.validationStatus && (
                            <div className="flex items-center space-x-2">
                              {getValidationStatusBadge(currentItem.validationStatus, currentItem.validationConfidence)}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {currentItem?.infoExplanation && (
                            <div className="text-xs text-green-600">
                              ✓ Additional info provided
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quantity */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                        placeholder="Qty"
                        className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    {/* Unit */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Unit
                      </label>
                      <input
                        {...register(`items.${index}.unit`)}
                        placeholder="Unit (e.g., pcs, ft, hrs)"
                        className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    {/* Unit Price */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Unit Price
                      </label>
                      <CurrencyInput
                        value={watch(`items.${index}.unit_price`)}
                        onChange={(value) => setValue(`items.${index}.unit_price`, value || 0)}
                        placeholder="0.00"
                      />
                    </div>

                  </div>

                  {/* Item Summary */}
                  {currentItem?.name && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-2">
                          <span>{getItemKindIcon(currentItem.kind)}</span>
                          <span className="font-medium">{currentItem.name}</span>
                          {getItemKindBadge(currentItem.kind)}
                        </div>
                        <div className="text-gray-600">
                          {currentItem.quantity} {currentItem.unit} × ${currentItem.unit_price?.toFixed(2) || '0.00'} = 
                          <span className="font-medium ml-1">
                            ${((currentItem.quantity || 0) * (currentItem.unit_price || 0)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Inline Validation Reason */}
                      {currentItem?.validationReason && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                          {currentItem.validationReason}
                        </div>
                      )}
                      
                      {/* Contextual Re-validation for Items Needing Review */}
                      {currentItem?.validationStatus === 'NEEDS_REVIEW' && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                          <div className="text-sm font-medium text-yellow-800 mb-2">
                            📝 Provide additional context for this item:
                          </div>
                          <div className="space-y-2">
                            <textarea
                              {...register(`items.${index}.infoExplanation`)}
                              placeholder="Explain why this item is needed for this project..."
                              className="w-full p-2 text-sm border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                              rows={2}
                            />
                            <button
                              type="button"
                              onClick={() => revalidateItem(index)}
                              disabled={isSubmitting}
                              className="w-full px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                            >
                              🔄 Re-validate with context
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          
          {/* Add Item Button - Moved to bottom */}
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => {
                appendItem({ name: '', quantity: 1, unit: 'pcs', unit_price: 0, needsInfo: false })
                // Smooth scroll to new item and focus on name input
                setTimeout(() => {
                  const newIndex = itemFields.length
                  const newItemElement = document.querySelector(`[data-item-index="${newIndex}"]`)
                  if (newItemElement) {
                    newItemElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    // Focus on the name input field
                    const nameInput = newItemElement.querySelector('input[placeholder*="Search materials"]')
                    if (nameInput) {
                      (nameInput as HTMLInputElement).focus()
                    }
                  }
                }, 100)
              }}
              className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg transition-all duration-200 hover:scale-110"
              title="Add new item"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        </div>




        {/* Submit Button */}
        <div className="text-center">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {isSubmitting ? 'Validating...' : '🔍 Validate Invoice'}
          </button>
        </div>
      </form>

      {/* Results Display */}
      {enhancedResult && (
        <EnhancedLineItemsTable result={enhancedResult} />
      )}

      {/* Inline Info Request Modal */}
      {infoRequest.itemIndex !== null && (
        <InlineInfoRequest
          isOpen={infoRequest.isOpen}
          onClose={handleCloseInfoRequest}
          onSubmit={handleSubmitInfo}
          itemName={watch(`items.${infoRequest.itemIndex}.name`) || 'Unnamed Item'}
          itemDescription={`${watch(`items.${infoRequest.itemIndex}.quantity`) || 0} ${watch(`items.${infoRequest.itemIndex}.unit`) || 'pcs'} × $${watch(`items.${infoRequest.itemIndex}.unit_price`) || 0}`}
          isSubmitting={infoRequest.isSubmitting}
        />
      )}
    </div>
  )
}