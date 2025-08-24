'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import StatusChips from './StatusChips'
import UnifiedTypeaheadInput from './UnifiedTypeaheadInput'
import CurrencyInput from './CurrencyInput'

interface LineItem {
  id?: string
  name: string
  quantity: number
  unit: string
  unit_price: number
  status?: string
  stageDetails?: any
  explanationRequired?: boolean
}

interface ValidationPipelineFormData {
  scope_of_work: string
  service_line_id: number
  service_type_id: number
  labor_hours: number
  items: LineItem[]
}

interface ExplanationModalProps {
  isOpen: boolean
  lineItem: LineItem | null
  onSubmit: (explanation: string) => void
  onClose: () => void
}

function ExplanationModal({ isOpen, lineItem, onSubmit, onClose }: ExplanationModalProps) {
  const [explanation, setExplanation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen || !lineItem) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!explanation.trim()) return
    
    setIsSubmitting(true)
    try {
      await onSubmit(explanation)
      setExplanation('')
      onClose()
    } catch (error) {
      console.error('Failed to submit explanation:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Explain Item Requirement</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <div className="font-medium">{lineItem.name}</div>
          <div className="text-sm text-gray-600">
            {lineItem.quantity} {lineItem.unit} × ${lineItem.unit_price}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Please explain why this item is needed for your project:
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Provide details about how this item relates to your project, why the quantity/price is appropriate, and any special circumstances..."
              required
              minLength={20}
              maxLength={1000}
            />
            <div className="text-xs text-gray-500 mt-1">
              {explanation.length}/1000 characters (minimum 20)
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting || explanation.trim().length < 20}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Explanation'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ValidationPipelineForm() {
  const [meta, setMeta] = useState<any>(null)
  const [filteredServiceTypes, setFilteredServiceTypes] = useState<any[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [explanationModal, setExplanationModal] = useState<{
    isOpen: boolean
    lineItem: LineItem | null
  }>({ isOpen: false, lineItem: null })

  const { register, control, handleSubmit, watch, setValue } = useForm<ValidationPipelineFormData>({
    defaultValues: {
      scope_of_work: '',
      service_line_id: 0,
      service_type_id: 0,
      labor_hours: 0,
      items: [{ name: '', quantity: 1, unit: 'pcs', unit_price: 0, status: 'NEW' }],
    }
  })

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control,
    name: 'items'
  })

  const selectedServiceLineId = watch('service_line_id')
  const currentItems = watch('items')

  // Load taxonomy data
  useEffect(() => {
    fetch('/api/taxonomy')
      .then(res => res.json())
      .then(data => {
        if (data && data.service_lines && data.service_types) {
          setMeta(data)
        }
      })
      .catch(err => console.error('Failed to fetch taxonomy:', err))
  }, [])

  // Filter service types based on selected service line
  useEffect(() => {
    if (meta && selectedServiceLineId) {
      const serviceTypeGroup = meta.service_types.find(
        (group: any) => group.service_line_id === selectedServiceLineId
      )
      setFilteredServiceTypes(serviceTypeGroup?.types || [])
      setValue('service_type_id', 0)
    } else {
      setFilteredServiceTypes([])
    }
  }, [selectedServiceLineId, meta, setValue])

  // Check if all items are ready for submission
  const isReadyForSubmission = () => {
    if (currentItems.length === 0) return false
    
    return currentItems.every(item => {
      if (!item.name?.trim()) return true // Skip empty items
      return item.status === 'READY_FOR_SUBMISSION'
    })
  }

  // Get items that need explanations
  const itemsNeedingExplanation = currentItems.filter(item => 
    item.status === 'NEEDS_EXPLANATION' && item.name?.trim()
  )

  const onSubmit = async (data: ValidationPipelineFormData) => {
    setIsSubmitting(true)
    try {
      // Filter out blank items
      const validItems = data.items.filter(item => item.name?.trim())
      
      // Step 1: Validate all items
      console.log('🚀 Starting validation pipeline...')
      
      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i]
        
        // Update status to show validation in progress
        setValue(`items.${i}.status`, 'AWAITING_MATCH')
        
        try {
          // Call validation API
          const validateResponse = await fetch('/api/items/validate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-User': 'demo-user',
              'X-Invoice-ID': 'demo-invoice-' + Date.now(),
            },
            body: JSON.stringify({
              lineItemId: `item-${i}-${Date.now()}`,
              itemName: item.name,
              itemDescription: `${item.quantity} ${item.unit} at $${item.unit_price} each`,
              serviceLine: meta?.service_lines?.find((sl: any) => sl.id === data.service_line_id)?.name,
              serviceType: filteredServiceTypes?.find((st: any) => st.id === data.service_type_id)?.name,
            })
          })
          
          const validateResult = await validateResponse.json()
          console.log(`✅ Validation result for ${item.name}:`, validateResult)
          
          if (validateResult.verdict === 'REJECTED') {
            setValue(`items.${i}.status`, 'VALIDATION_REJECTED')
            continue
          }
          
          // Step 2: Try matching
          setValue(`items.${i}.status`, 'MATCHED')
          
          // Step 3: Simulate price validation
          setValue(`items.${i}.status`, 'PRICE_VALIDATED')
          
          // Step 4: Apply rules (simulate context inconsistency for demo)
          if (item.name.toLowerCase().includes('industrial') && 
              data.service_line_id === 1) { // Office service with industrial item
            setValue(`items.${i}.status`, 'NEEDS_EXPLANATION')
            setValue(`items.${i}.explanationRequired`, true)
          } else {
            setValue(`items.${i}.status`, 'READY_FOR_SUBMISSION')
          }
          
          // Add stage details
          setValue(`items.${i}.stageDetails`, {
            validation: {
              verdict: validateResult.verdict,
              score: validateResult.score,
              reasons: validateResult.reasons,
            },
            matching: { canonicalItemId: 'mock-item-id', confidence: 0.85 },
            pricing: { validated: true },
          })
          
          // Small delay for demo effect
          await new Promise(resolve => setTimeout(resolve, 500))
          
        } catch (error) {
          console.error(`❌ Failed to process item ${item.name}:`, error)
          setValue(`items.${i}.status`, 'VALIDATION_REJECTED')
        }
      }
      
      console.log('🎉 Pipeline processing completed!')
      
    } catch (error) {
      console.error('❌ Pipeline failed:', error)
      alert('Pipeline processing failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExplainNeeded = (itemIndex: number) => {
    const item = currentItems[itemIndex]
    setExplanationModal({
      isOpen: true,
      lineItem: { ...item, id: String(itemIndex) }
    })
  }

  const handleExplanationSubmit = async (explanation: string) => {
    const itemIndex = parseInt(explanationModal.lineItem?.id || '0')
    
    try {
      // Submit explanation to API
      const response = await fetch('/api/items/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User': 'demo-user',
          'X-Invoice-ID': 'demo-invoice',
        },
        body: JSON.stringify({
          lineItemId: `item-${itemIndex}-explanation`,
          explanationText: explanation,
          submittedBy: 'demo-user',
        })
      })
      
      const result = await response.json()
      console.log('📝 Explanation submitted:', result)
      
      // Update item status to ready (assuming explanation accepted for demo)
      setValue(`items.${itemIndex}.status`, 'READY_FOR_SUBMISSION')
      setValue(`items.${itemIndex}.explanationRequired`, false)
      
      // Update stage details
      const currentStageDetails = currentItems[itemIndex].stageDetails || {}
      setValue(`items.${itemIndex}.stageDetails`, {
        ...currentStageDetails,
        explanation: {
          required: true,
          submitted: true,
          accepted: true,
        }
      })
      
    } catch (error) {
      console.error('❌ Failed to submit explanation:', error)
      throw error
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Validation-First Invoice Pipeline</h1>
        <p className="mt-2 text-gray-600">Items are validated before matching, with real-time status tracking</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Form fields similar to original but simplified for demo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scope of Work
            </label>
            <input
              {...register('scope_of_work')}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Describe the work being performed..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Labor Hours
            </label>
            <input
              type="number"
              step="0.1"
              {...register('labor_hours', { valueAsNumber: true })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Items Section with Status Tracking */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Line Items with Pipeline Status</h3>
              <p className="text-sm text-gray-500 mt-1">
                Items progress through validation → matching → pricing → rules → ready
              </p>
            </div>
            <button
              type="button"
              onClick={() => appendItem({ name: '', quantity: 1, unit: 'pcs', unit_price: 0, status: 'NEW' })}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Item
            </button>
          </div>
          
          <div className="space-y-4">
            {itemFields.map((field, index) => {
              const currentItem = watch(`items.${index}`)
              return (
                <div key={field.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-end mb-3">
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Item Name
                      </label>
                      <input
                        {...register(`items.${index}.name`)}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        placeholder="Enter item name..."
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                      <input
                        type="number"
                        {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price</label>
                      <input
                        type="number"
                        step="0.01"
                        {...register(`items.${index}.unit_price`, { valueAsNumber: true })}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    
                    <div>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="w-full px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                        disabled={itemFields.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Status Chips Row */}
                  {currentItem?.name && (
                    <div className="pt-3 border-t border-gray-100">
                      <StatusChips
                        status={currentItem.status || 'NEW'}
                        stageDetails={currentItem.stageDetails}
                        lineItemId={String(index)}
                        onExplainNeeded={() => handleExplainNeeded(index)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Submit Button with Gating */}
        <div className="text-center space-y-4">
          {itemsNeedingExplanation.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ {itemsNeedingExplanation.length} item(s) need explanation before submission
              </p>
            </div>
          )}
          
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {isSubmitting ? '🔄 Processing Pipeline...' : '🚀 Start Validation Pipeline'}
          </button>
          
          {!isReadyForSubmission() && currentItems.some(item => item.name?.trim()) && (
            <button
              type="button"
              disabled={true}
              className="ml-4 px-8 py-3 bg-gray-400 text-white rounded-lg opacity-50 font-medium cursor-not-allowed"
            >
              🔒 Submit Invoice (Waiting for all items to be ready)
            </button>
          )}
          
          {isReadyForSubmission() && currentItems.some(item => item.name?.trim()) && (
            <button
              type="button"
              className="ml-4 px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              onClick={() => alert('🎉 Invoice ready for submission! All items have passed validation.')}
            >
              ✅ Submit Invoice
            </button>
          )}
        </div>
      </form>

      {/* Explanation Modal */}
      <ExplanationModal
        isOpen={explanationModal.isOpen}
        lineItem={explanationModal.lineItem}
        onSubmit={handleExplanationSubmit}
        onClose={() => setExplanationModal({ isOpen: false, lineItem: null })}
      />
    </div>
  )
}