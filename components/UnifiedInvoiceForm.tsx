'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { getMeta, validateUnifiedInvoice } from '../lib/api'
import { MetaResponse, ServiceType, ValidationResponse } from '../lib/types'
import LineItemsTable from './LineItemsTable'
import UnifiedTypeaheadInput from './UnifiedTypeaheadInput'
import CurrencyInput from './CurrencyInput'

interface LineItem {
  name: string
  quantity: number
  unit: string
  unit_price: number
  kind?: 'material' | 'equipment' // Auto-detected from search
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
  const [saveEnabled, setSaveEnabled] = useState(false)

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<UnifiedInvoiceFormData>({
    defaultValues: {
      scope_of_work: '',
      service_line_id: 0,
      service_type_id: 0,
      labor_hours: 0,
      items: [{ name: '', quantity: 1, unit: 'pcs', unit_price: 0 }],
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
    if (meta && selectedServiceLineId) {
      const serviceTypeGroup = meta.service_types.find(
        group => group.service_line_id === selectedServiceLineId
      )
      setFilteredServiceTypes(serviceTypeGroup?.types || [])
      setValue('service_type_id', 0)
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
      
      const response = await validateUnifiedInvoice(payload, saveEnabled)
      setResult(response)
    } catch (error) {
      console.error('Validation failed:', error)
      alert('Failed to validate invoice')
    } finally {
      setIsSubmitting(false)
    }
  }

  const runTest = async (testName: string, testData: UnifiedInvoiceFormData) => {
    setIsSubmitting(true)
    setResult(null)
    try {
      const validItems = testData.items.filter(item => (item.name || '').trim() !== '')
      
      // Send unified items directly to the new API
      const payload = {
        scope_of_work: testData.scope_of_work,
        service_line_id: testData.service_line_id,
        service_type_id: testData.service_type_id,
        labor_hours: testData.labor_hours,
        items: validItems
      }
      
      const response = await validateUnifiedInvoice(payload, saveEnabled)
      setResult({ ...response, testName })
    } catch (error) {
      console.error('Test failed:', error)
      alert(`${testName} failed`)
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

  const showSamples = process.env.NEXT_PUBLIC_SHOW_SAMPLES !== 'false'

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
              onClick={() => appendItem({ name: '', quantity: 1, unit: 'pcs', unit_price: 0 })}
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
                        Item Name
                      </label>
                      <UnifiedTypeaheadInput
                        value={watch(`items.${index}.name`) || ''}
                        onChange={(value) => setValue(`items.${index}.name`, value)}
                        onSelect={(label, kind) => handleItemSelect(index, label, kind)}
                        serviceLineId={selectedServiceLineId || undefined}
                        serviceTypeId={watch('service_type_id') || undefined}
                        placeholder="Search materials or equipment..."
                      />
                      {currentItem?.kind && (
                        <div className="mt-1 flex items-center space-x-2">
                          <span className="text-sm">{getItemKindIcon(currentItem.kind)}</span>
                          {getItemKindBadge(currentItem.kind)}
                        </div>
                      )}
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

        {/* Sample Invoices */}
        {showSamples && (
          <div className="border-t pt-6">
            <div className="text-center mb-4">
              <h3 className="text-lg font-medium mb-2">Sample Invoices (demo)</h3>
              <p className="text-sm text-gray-500">These fill the form with example data and run validation to illustrate outcomes.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <button
                type="button"
                onClick={() => runTest('Sample A — ALLOW', {
                  scope_of_work: 'Water heater replacement',
                  service_line_id: 14,
                  service_type_id: 2,
                  labor_hours: 2.5,
                  items: [
                    { name: 'Anode Rod', quantity: 1, unit: 'pcs', unit_price: 1200, kind: 'material' },
                    { name: 'Pipe Wrench', quantity: 1, unit: 'day', unit_price: 400, kind: 'equipment' }
                  ]
                })}
                disabled={isSubmitting}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Sample A — ALLOW<br /><small>(Anode Rod + Pipe Wrench)</small>
              </button>
              <button
                type="button"
                onClick={() => runTest('Sample B — PRICE_HIGH', {
                  scope_of_work: 'Water heater replacement',
                  service_line_id: 14,
                  service_type_id: 2,
                  labor_hours: 2.5,
                  items: [
                    { name: 'Anode Rod', quantity: 1, unit: 'pcs', unit_price: 20000, kind: 'material' }
                  ]
                })}
                disabled={isSubmitting}
                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
              >
                Sample B — PRICE_HIGH<br /><small>(Anode Rod@20000)</small>
              </button>
              <button
                type="button"
                onClick={() => runTest('Sample C — MUTEX', {
                  scope_of_work: 'Equipment conflict',
                  service_line_id: 14,
                  service_type_id: 2,
                  labor_hours: 0,
                  items: [
                    { name: 'Pipe Wrench', quantity: 1, unit: 'day', unit_price: 400, kind: 'equipment' },
                    { name: 'Drain Snake', quantity: 1, unit: 'day', unit_price: 800, kind: 'equipment' }
                  ]
                })}
                disabled={isSubmitting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                Sample C — MUTEX<br /><small>(Pipe Wrench + Drain Snake)</small>
              </button>
            </div>
          </div>
        )}

        {/* Save Toggle */}
        <div className="flex items-center justify-center gap-2 pb-4">
          <input
            type="checkbox"
            id="save-toggle"
            checked={saveEnabled}
            onChange={(e) => setSaveEnabled(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="save-toggle" className="text-sm text-gray-700">
            Save validation run to database
          </label>
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
    </div>
  )
}