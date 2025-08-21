import { NextResponse } from 'next/server'

export async function GET() {
  // Return business metadata for InvoiceForm
  return NextResponse.json({
    ok: true,
    service_lines: [
      { id: 1, name: "Facility Maintenance" },
      { id: 2, name: "IT Services" },
      { id: 3, name: "Consulting" }
    ],
    service_types: [
      {
        service_line_id: 1,
        types: [
          { id: 101, name: "HVAC Repair" },
          { id: 102, name: "Plumbing" },
          { id: 103, name: "Electrical" }
        ]
      },
      {
        service_line_id: 2,
        types: [
          { id: 201, name: "Hardware Support" },
          { id: 202, name: "Software Installation" },
          { id: 203, name: "Network Setup" }
        ]
      },
      {
        service_line_id: 3,
        types: [
          { id: 301, name: "Strategy" },
          { id: 302, name: "Implementation" },
          { id: 303, name: "Training" }
        ]
      }
    ]
  })
}