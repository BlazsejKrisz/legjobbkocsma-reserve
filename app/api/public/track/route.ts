import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const ALLOWED_EVENTS = ['load', 'slots_loaded', 'slots_empty', 'submit', 'error'] as const
const ALLOWED_REASONS = [
  'party_size_exceeded',
  'booking_disabled',
  'venue_not_found',
  'invalid_payload',
  'unknown',
] as const

const TrackSchema = z.object({
  event:      z.enum(ALLOWED_EVENTS),
  domain:     z.string().max(253).default('direct'),
  venue_slug: z.string().max(100).optional(),
  slot_count: z.number().int().nonnegative().optional(),
  status:     z.enum(['confirmed', 'pending_manual_review']).optional(),
  code:       z.number().int().optional(),
  reason:     z.enum(ALLOWED_REASONS).optional(),
})

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new NextResponse(null, { status: 204, headers: CORS })
  }

  const parsed = TrackSchema.safeParse(body)
  if (!parsed.success) {
    return new NextResponse(null, { status: 204, headers: CORS })
  }

  const { event, domain, venue_slug, slot_count, status, code, reason } = parsed.data

  const supabase = createAdminClient()
  await supabase.from('embed_events').insert({
    event,
    domain,
    venue_slug: venue_slug ?? null,
    slot_count: slot_count ?? null,
    status:     status ?? null,
    code:       code ?? null,
    reason:     reason ?? null,
  })

  // Always 204 — never leak DB errors to the embed
  return new NextResponse(null, { status: 204, headers: CORS })
}
