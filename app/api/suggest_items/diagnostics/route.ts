import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Only available in non-production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  const startTime = process.hrtime.bigint();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() || 'test';
  const vendorId = searchParams.get('vendorId');
  const serviceLineId = searchParams.get('serviceLineId');
  const serviceTypeId = searchParams.get('serviceTypeId');

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
    );

    if (!process.env.SUPABASE_URL) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Count fuzzy matches
    let fuzzyQuery = supabase
      .from('canonical_items')
      .select('*', { count: 'exact', head: true })
      .ilike('canonical_name', `%${q}%`)
      .eq('is_active', true);

    if (serviceLineId) {
      fuzzyQuery = fuzzyQuery.eq('service_line_id', parseInt(serviceLineId));
    }

    const { count: fuzzyCount } = await fuzzyQuery;

    // Count synonyms matches (if we query synonyms table)
    const { count: synonymsCount } = await supabase
      .from('item_synonyms')
      .select('*', { count: 'exact', head: true })
      .ilike('synonym', `%${q}%`);

    // Count vendor boost candidates
    let vendorCount = 0;
    if (vendorId) {
      const { count } = await supabase
        .from('vendor_catalog_items')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendorId)
        .eq('is_active', true);
      vendorCount = count || 0;
    }

    // Count fallback candidates
    let fallbackQuery = supabase
      .from('canonical_items')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .gt('popularity', 0);

    if (serviceLineId) {
      fallbackQuery = fallbackQuery.eq('service_line_id', parseInt(serviceLineId));
    } else if (serviceTypeId) {
      fallbackQuery = fallbackQuery.eq('service_lines.service_type_id', parseInt(serviceTypeId));
    }

    const { count: fallbackCount } = await fallbackQuery;

    const elapsed = Number(process.hrtime.bigint() - startTime) / 1_000_000;

    return NextResponse.json({
      counts: {
        fuzzy: fuzzyCount || 0,
        synonyms: synonymsCount || 0,
        vendorBoost: vendorCount,
        fallback: fallbackCount || 0
      },
      ms: parseFloat(elapsed.toFixed(1))
    });

  } catch (error) {
    console.error('[diagnostics] Error:', error);
    return NextResponse.json({ error: 'Diagnostics failed' }, { status: 500 });
  }
}