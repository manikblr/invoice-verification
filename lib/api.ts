import { MetaResponse, InvoicePayload, ValidationResponse } from './types'

const API_BASE = '/api'

export async function getMeta(): Promise<MetaResponse> {
  const response = await fetch(`${API_BASE}/meta`)
  if (!response.ok) {
    throw new Error('Failed to fetch metadata')
  }
  return response.json()
}

export async function validateInvoice(payload: InvoicePayload, save?: boolean): Promise<ValidationResponse> {
  const requestPayload = { ...payload, save: save || false }
  const response = await fetch(`${API_BASE}/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestPayload),
  })
  if (!response.ok) {
    throw new Error('Failed to validate invoice')
  }
  return response.json()
}