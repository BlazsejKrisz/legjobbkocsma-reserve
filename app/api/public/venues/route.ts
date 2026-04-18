import { ok, dbErr } from '@/lib/api/http'
import { createClient } from '@/lib/supabase/server'
import { checkApiKey } from '@/lib/api/publicGuard'
import { NextResponse } from 'next/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * Public endpoint — no auth required.
 * Returns active venues with their slug, name, and basic settings.
 * Used by external booking forms (e.g. WordPress sites) to populate venue pickers.
 */
export async function GET(req: Request) {
  const keyErr = checkApiKey(req)
  if (keyErr) return keyErr

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('venues')
    .select(`
      id, name, slug,
      venue_settings (
        booking_enabled,
        min_notice_minutes,
        max_advance_booking_days,
        min_duration_minutes,
        max_duration_minutes,
        max_party_size
      )
    `)
    .eq('is_active', true)
    .eq('venue_settings.booking_enabled', true)
    .order('name')

  if (error) return dbErr(error)

  return ok({ data: data ?? [] }, { headers: CORS })
}
