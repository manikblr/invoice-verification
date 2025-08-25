'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { getMeta, validateInvoice } from '../lib/api'
import { MetaResponse, ServiceType, ValidationResponse } from '../lib/types'
import LineItemsTable from './LineItemsTable'
import TypeaheadInput from './TypeaheadInput'
import CurrencyInput from './CurrencyInput'

interface InvoiceFormData {
  scope_of_work: string
  service_line_id: number
  service_type_id: number
  labor_hours: number
  materials: Array<{
    name: string
    quantity: number
    unit: string
    unit_price: number
  }>
  equipment: Array<{
    name: string
    quantity: number
    unit: string
    unit_price: number
  }>
}

export default function InvoiceForm() {
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [filteredServiceTypes, setFilteredServiceTypes] = useState<ServiceType[]>([])
  const [result, setResult] = useState<ValidationResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<InvoiceFormData>({
    defaultValues: {
      scope_of_work: '',
      service_line_id: 0,
      service_type_id: 0,
      labor_hours: 0,
      materials: [{ name: '', quantity: 1, unit: 'pcs', unit_price: 0 }],
      equipment: [{ name: '', quantity: 1, unit: 'pcs', unit_price: 0 }],
    }
  })

  const { fields: materialFields, append: appendMaterial, remove: removeMaterial } = useFieldArray({
    control,
    name: 'materials'
  })

  const { fields: equipmentFields, append: appendEquipment, remove: removeEquipment } = useFieldArray({
    control,
    name: 'equipment'
  })

  const selectedServiceLineId = watch('service_line_id')

  useEffect(() => {
    // Fetch live taxonomy data instead of hardcoded demo data
    fetch('/api/taxonomy')
      .then(res => res.json())
      .then(data => {
        // Ensure data has expected structure to prevent crashes
        if (data && data.service_lines && data.service_types) {
          setMeta(data)
        } else {
          console.warn('Invalid taxonomy data received:', data)
          // Set empty but valid structure to prevent crashes
          setMeta({
            ok: true,
            service_lines: [],
            service_types: []
          })
        }
      })
      .catch(err => {
        console.error('Failed to fetch taxonomy:', err)
        // Set fallback data to prevent crashes
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

  const onSubmit = async (data: InvoiceFormData) => {
    setIsSubmitting(true)
    setResult(null)
    try {
      // Filter out blank item names before sending
      const materials = data.materials.filter(m => (m.name || '').trim() !== '')
      const equipment = data.equipment.filter(e => (e.name || '').trim() !== '')
      
      const payload = {
        ...data,
        materials,
        equipment
      }
      
      const response = await validateInvoice(payload, true)
      setResult(response)
    } catch (error) {
      console.error('Validation failed:', error)
      alert('Failed to validate invoice')
    } finally {
      setIsSubmitting(false)
    }
  }


  if (!meta) {
    return <div className="text-center">Loading...</div>
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md" data-testid="invoice-form">
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

        {/* Materials Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium">Materials</h3>
            <button
              type="button"
              onClick={() => appendMaterial({ name: '', quantity: 1, unit: 'pcs', unit_price: 0 })}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Add Material
            </button>
          </div>
          <div className="space-y-2">
            {materialFields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                <div>
                  <TypeaheadInput
                    value={watch(`materials.${index}.name`) || ''}
                    onChange={(value) => setValue(`materials.${index}.name`, value)}
                    onSelect={(label) => setValue(`materials.${index}.name`, label)}
                    kind="material"
                    serviceLineId={selectedServiceLineId || undefined}
                    serviceTypeId={watch('service_type_id') || undefined}
                    placeholder="Material name"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    min="0"
                    {...register(`materials.${index}.quantity`, { valueAsNumber: true })}
                    placeholder="Qty"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <input
                    {...register(`materials.${index}.unit`)}
                    placeholder="Unit"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <CurrencyInput
                    value={watch(`materials.${index}.unit_price`)}
                    onChange={(value) => setValue(`materials.${index}.unit_price`, value || 0)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => removeMaterial(index)}
                    className="px-2 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                    disabled={materialFields.length === 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Equipment Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium">Equipment</h3>
            <button
              type="button"
              onClick={() => appendEquipment({ name: '', quantity: 1, unit: 'pcs', unit_price: 0 })}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Add Equipment
            </button>
          </div>
          <div className="space-y-2">
            {equipmentFields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                <div>
                  <TypeaheadInput
                    value={watch(`equipment.${index}.name`) || ''}
                    onChange={(value) => setValue(`equipment.${index}.name`, value)}
                    onSelect={(label) => setValue(`equipment.${index}.name`, label)}
                    kind="equipment"
                    serviceLineId={selectedServiceLineId || undefined}
                    serviceTypeId={watch('service_type_id') || undefined}
                    placeholder="Equipment name"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    min="0"
                    {...register(`equipment.${index}.quantity`, { valueAsNumber: true })}
                    placeholder="Qty"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <input
                    {...register(`equipment.${index}.unit`)}
                    placeholder="Unit"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <CurrencyInput
                    value={watch(`equipment.${index}.unit_price`)}
                    onChange={(value) => setValue(`equipment.${index}.unit_price`, value || 0)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => removeEquipment(index)}
                    className="px-2 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                    disabled={equipmentFields.length === 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>



        <div className="text-center">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Validating...' : 'Validate Invoice'}
          </button>
        </div>
      </form>

      {result && <LineItemsTable result={result} />}
    </div>
  )
}