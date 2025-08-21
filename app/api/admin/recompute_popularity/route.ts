import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // No authentication required for experimental use

    // Use service role client
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Recompute popularity from vendor_catalog_items frequency
    const { error } = await supabase.rpc('recompute_popularity');

    if (error) {
      console.error('[recompute_popularity] Error:', error);
      return NextResponse.json({ error: 'Failed to recompute popularity' }, { status: 500 });
    }

    // Get updated count
    const { count } = await supabase
      .from('canonical_items')
      .select('*', { count: 'exact', head: true })
      .gt('popularity', 0);

    return NextResponse.json({ 
      updated: count || 0,
      message: 'Popularity recomputed successfully'
    });

  } catch (error) {
    console.error('[recompute_popularity] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}