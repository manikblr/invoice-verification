import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
)

export async function GET() {
  try {
    // Fetch service lines
    const { data: serviceLines, error: linesError } = await supabase
      .from('service_lines')
      .select('id, name')
      .eq('is_active', true)
      .order('name')

    // Fetch service types  
    const { data: serviceTypes, error: typesError } = await supabase
      .from('service_types')
      .select('id, name, service_line_id')
      .eq('is_active', true)
      .order('name')

    if (linesError || typesError) {
      // Fallback to empty arrays on DB error
      return NextResponse.json({
        serviceTypes: [],
        serviceLines: []
      })
    }

    // Group service types by service_line_id
    const groupedTypes = (serviceTypes || []).reduce((acc, type) => {
      const lineId = type.service_line_id
      if (!acc[lineId]) acc[lineId] = []
      acc[lineId].push({ id: type.id, name: type.name })
      return acc
    }, {} as Record<number, any[]>)

    // Format for compatibility with existing frontend
    const formattedServiceTypes = (serviceLines || []).map(line => ({
      service_line_id: line.id,
      types: groupedTypes[line.id] || []
    }))

    return NextResponse.json({
      ok: true,
      service_lines: serviceLines || [],
      service_types: formattedServiceTypes
    })
  } catch (error) {
    // Safe fallback on any error
    return NextResponse.json({
      ok: true,
      service_lines: [],
      service_types: []
    })
  }
}