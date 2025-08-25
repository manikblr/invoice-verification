import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      console.warn('[taxonomy] Supabase not configured, using fallback data')
      return NextResponse.json({
        ok: true,
        service_lines: [
          { id: 1, name: "Plumbing" },
          { id: 2, name: "Electrical" },
          { id: 3, name: "HVAC" }
        ],
        service_types: [
          {
            service_line_id: 1,
            types: [
              { id: 101, name: "Repair" },
              { id: 102, name: "Install" },
              { id: 103, name: "Inspection" }
            ]
          },
          {
            service_line_id: 2,
            types: [
              { id: 201, name: "Repair" },
              { id: 202, name: "Install" },
              { id: 203, name: "Inspection" }
            ]
          },
          {
            service_line_id: 3,
            types: [
              { id: 301, name: "Repair" },
              { id: 302, name: "Install" },
              { id: 303, name: "Maintenance" }
            ]
          }
        ]
      })
    }

    // Create Supabase client (credentials already verified above)
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
    )

    // Fetch service lines
    const { data: serviceLines, error: linesError } = await supabase
      .from('service_lines')
      .select('id, name')
      .order('name')

    // Fetch service types  
    const { data: serviceTypes, error: typesError } = await supabase
      .from('service_types')
      .select('id, name, service_line_id')
      .order('name')

    // Debug logging
    console.log('[taxonomy] Fetched service lines:', serviceLines?.length || 0)
    console.log('[taxonomy] Fetched service types:', serviceTypes?.length || 0)

    if (linesError || typesError) {
      console.warn('[taxonomy] DB error:', linesError || typesError)
      // Fallback to demo data on DB error
      return NextResponse.json({
        ok: true,
        service_lines: [
          { id: 1, name: "Plumbing" },
          { id: 2, name: "Electrical" },
          { id: 3, name: "HVAC" }
        ],
        service_types: [
          { service_line_id: 1, types: [{ id: 101, name: "Repair" }] },
          { service_line_id: 2, types: [{ id: 201, name: "Repair" }] },
          { service_line_id: 3, types: [{ id: 301, name: "Repair" }] }
        ]
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