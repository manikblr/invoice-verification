'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { getMeta, validateUnifiedInvoice } from '../lib/api'
import { MetaResponse, ServiceType, ValidationResponse } from '../lib/types'
import LineItemsTable from './LineItemsTable'
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
  const [result, setResult] = useState<ValidationResponse | null>(null)
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
    setResult(null)
    try {
      // Filter out blank item names
      const validItems = data.items.filter(item => (item.name || '').trim() !== '')
      
      // Send unified items directly to the new API
      const payload = {
        scope_of_work: data.scope_of_work,
        service_line_id: data.service_line_id,
        service_type_id: data.service_type_id,
        labor_hours: data.labor_hours,
        items: validItems
      }
      
      const response = await validateUnifiedInvoice(payload, true)
      setResult(response)
    } catch (error) {
      console.error('Validation failed:', error)
      alert('Failed to validate invoice')
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Materials & Equipment</h3>
              <p className="text-sm text-gray-500 mt-1">
                Search for any materials or equipment - the system will automatically categorize them
              </p>
            </div>
            <button
              type="button"
              onClick={() => appendItem({ name: '', quantity: 1, unit: 'pcs', unit_price: 0, needsInfo: false })}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Add Item
            </button>
          </div>
          
          <div className="space-y-3">
            {itemFields.map((field, index) => {
              const currentItem = watch(`items.${index}`)
              return (
                <div key={field.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 items-end">
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
                        </div>
                        {currentItem?.infoExplanation && (
                          <div className="text-xs text-green-600">
                            ✓ Additional info provided
                          </div>
                        )}
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

                    {/* Remove Button */}
                    <div>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="w-full px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                        disabled={itemFields.length === 1}
                      >
                        Remove
                      </button>
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
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>



        {/* Submit Button */}
        <div className="text-center">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {isSubmitting ? 'Validating...' : 'Validate Invoice'}
          </button>
        </div>
      </form>

      {result && <LineItemsTable result={result} />}

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