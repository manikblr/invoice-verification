export interface ServiceLine {
  id: number
  name: string
}

export interface ServiceType {
  id: number
  name: string
}

export interface ServiceTypeGroup {
  service_line_id: number
  types: ServiceType[]
}

export interface MetaResponse {
  ok: boolean
  service_lines: ServiceLine[]
  service_types: ServiceTypeGroup[]
}

export interface LineItem {
  name: string
  quantity: number
  unit: string
  unit_price: number
}

export interface InvoicePayload {
  scope_of_work: string
  service_line_id: number
  service_type_id: number
  labor_hours: number
  materials: LineItem[]
  equipment: LineItem[]
}

export interface ValidationResponse {
  ok: boolean
  mode: string
  invoice_status: 'ALLOW' | 'NEEDS_REVIEW' | 'REJECT'
  invoice_id: string | null
  save_warning?: string
  testName?: string
  summary: {
    allow: number
    needs_review: number
    reject: number
    total_lines: number
  }
  lines: Array<{
    type: 'material' | 'equipment' | 'labor'
    index: number
    input: any
    status: 'ALLOW' | 'NEEDS_REVIEW' | 'REJECT'
    reason_codes: string[]
    match?: {
      canonical: string
      canonical_id: string
      confidence: number
    }
    pricing?: {
      unit_price: number
      currency: string
      min?: number
      max?: number
    }
  }>
}