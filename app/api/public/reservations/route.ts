import { after, NextResponse } from 'next/server'
import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { createAdminClient } from '@/lib/supabase/server'
import { PartnerReservationSchema } from '@/lib/validators/reservations'
import { enqueueNotification } from '@/lib/notifications/enqueue'
import { drainOne } from '@/lib/notifications/drain'
import type { NotificationKind } from '@/lib/notifications/types'
import { checkApiKey, validateBookingDate, validatePartySize } from '@/lib/api/publicGuard'
import { checkIpRateLimit, checkEmailRateLimit } from '@/lib/api/rateLimiter'
import { addMinutes } from 'date-fns'

type CreateReservationRpcResult = {
  reservation_id: number
  status: 'confirmed' | 'pending_manual_review'
  assigned_venue_id: number | null
  overflow_reason: string | null
}

// ─── CORS helpers ─────────────────────────────────────────────────────────────

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
  }
}

function getIp(req: Request): string {
  const fwd = (req as unknown as { headers: Headers }).headers.get('x-forwarded-for')
  return fwd?.split(',')[0].trim() ?? 'unknown'
}

/**
 * Resolves the allowed origin for a venue.
 * Returns the origin string to echo back, or null if it is not allowed.
 * An empty allowed_origins list means all origins are permitted.
 */
async function resolveOrigin(
  venueSlug: string,
  requestOrigin: string | null,
): Promise<{ origin: string; allowed: boolean } | null> {
  const supabase = createAdminClient()
  const { data: venue } = await supabase
    .from('venues')
    .select('allowed_origins')
    .eq('slug', venueSlug)
    .eq('is_active', true)
    .single()

  if (!venue) return null

  const list: string[] = venue.allowed_origins ?? []

  // Empty list → allow all origins (backward compatibility)
  if (list.length === 0) {
    return { origin: requestOrigin ?? '*', allowed: true }
  }

  if (!requestOrigin || !list.includes(requestOrigin)) {
    return { origin: '', allowed: false }
  }

  return { origin: requestOrigin, allowed: true }
}

// ─── OPTIONS (preflight) ──────────────────────────────────────────────────────

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin')
  const url = new URL(req.url)
  const venueSlug = url.searchParams.get('venue')

  if (venueSlug) {
    const resolved = await resolveOrigin(venueSlug, origin)
    if (!resolved || !resolved.allowed) {
      return new NextResponse(null, { status: 403 })
    }
    return new NextResponse(null, { status: 204, headers: corsHeaders(resolved.origin) })
  }

  // No venue slug on preflight → allow (POST will enforce)
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin ?? '*'),
  })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Permissive CORS for early errors (before we know the venue + can do
  // the per-venue origin check).  The actual origin gate happens at step 5;
  // these headers exist so JS can read pre-step-5 error bodies instead of
  // seeing an opaque CORS-blocked failure.
  const earlyOrigin = req.headers.get('origin') ?? '*'
  const earlyCors = corsHeaders(earlyOrigin)

  // 1. API key gate (optional env-var based)
  const keyErr = checkApiKey(req)
  if (keyErr) {
    const body = await keyErr.json() as { error: string }
    return err(body.error, { status: keyErr.status, headers: earlyCors })
  }

  // 2. Read raw body — needed for honeypot check before Zod strips unknown fields
  const rawBody = await safeJson(req)

  // 3. HONEYPOT — silent accept, do not reveal to bots
  if (typeof rawBody === 'object' && rawBody !== null && (rawBody as Record<string, unknown>)._hp) {
    return ok({ reservation_id: null, status: 'confirmed' })
  }

  // 4. Zod validation (strips _hp and other unknown fields)
  const parsed = PartnerReservationSchema.safeParse(rawBody)
  if (!parsed.success) {
    // Resolve origin for the error response if possible
    const slug = typeof rawBody === 'object' && rawBody !== null
      ? (rawBody as Record<string, unknown>).venue_slug as string | undefined
      : undefined
    const origin = req.headers.get('origin')
    const resolved = slug ? await resolveOrigin(slug, origin) : null
    const headers = resolved?.allowed ? corsHeaders(resolved.origin) : {}
    return err('Invalid payload', { status: 400, details: parsed.error.issues, headers })
  }

  const payload = parsed.data

  // 5. CORS — per-venue origin check
  const requestOrigin = req.headers.get('origin')
  const resolved = await resolveOrigin(payload.venue_slug, requestOrigin)

  if (!resolved) {
    return err(`Venue '${payload.venue_slug}' not found`, { status: 404, headers: earlyCors })
  }
  if (!resolved.allowed) {
    return err('origin_not_allowed', { status: 403, headers: earlyCors })
  }

  const CORS = corsHeaders(resolved.origin)

  // 6. RATE LIMIT — IP
  const ip = getIp(req)
  const ipOk = await checkIpRateLimit(ip)
  if (!ipOk) {
    return err('too_many_requests', { status: 429, headers: CORS })
  }

  // 7. RATE LIMIT — email
  if (payload.customer.email) {
    const emailOk = await checkEmailRateLimit(payload.customer.email)
    if (!emailOk) {
      return err('too_many_requests', { status: 429, headers: CORS })
    }
  }

  // 8. Business logic ──────────────────────────────────────────────────────────

  const partySizeErr = validatePartySize(payload.party_size)
  if (partySizeErr) return err('party_size must be between 1 and 500', { status: 400, headers: CORS })

  const supabase = createAdminClient()

  const { data: venue, error: venueErr } = await supabase
    .from('venues')
    .select(`
      id, name, logo_url, address, phone, website, email_contact,
      venue_settings (
        booking_enabled,
        default_duration_minutes,
        max_party_size,
        max_advance_booking_days
      )
    `)
    .eq('slug', payload.venue_slug)
    .eq('is_active', true)
    .single()

  if (venueErr || !venue) return err(`Venue '${payload.venue_slug}' not found`, { status: 404, headers: CORS })

  const settings = venue.venue_settings as unknown as {
    booking_enabled: boolean
    default_duration_minutes: number
    max_party_size: number
    max_advance_booking_days: number
  } | null

  if (!settings?.booking_enabled) {
    return err('Venue is not accepting bookings', { status: 422, headers: CORS })
  }
  // Oversized parties are NOT rejected — the RPC routes them to overflow
  // (pending_manual_review with overflow_reason = 'party_size_exceeds_limit')

  const dateErr = validateBookingDate(
    payload.starts_at.slice(0, 10),
    settings.max_advance_booking_days ?? 90,
  )
  if (dateErr) {
    const body = await dateErr.json() as { error: string }
    return err(body.error, { status: dateErr.status, headers: CORS })
  }

  // Resolve table type if code was given
  let tableTypeId: number | null = null
  if (payload.table_type_code) {
    const { data: tt } = await supabase
      .from('table_types')
      .select('id')
      .eq('code', payload.table_type_code)
      .eq('is_active', true)
      .single()
    if (tt) tableTypeId = tt.id
  }

  // Compute ends_at
  const startsAt = new Date(payload.starts_at)
  const durationMinutes = payload.duration_minutes ?? settings.default_duration_minutes ?? 120
  const endsAt = addMinutes(startsAt, durationMinutes)

  // Upsert customer
  const { data: customer, error: customerErr } = await supabase.rpc('get_or_create_customer', {
    p_full_name: payload.customer.full_name,
    p_email: payload.customer.email ?? null,
    p_phone: payload.customer.phone ?? null,
  })
  if (customerErr) return dbErr(customerErr, 'get_or_create_customer')
  const customerId = customer as number

  // Create reservation
  const { data: rpcRow, error: rpcError } = await supabase
    .rpc('create_reservation_auto', {
      p_requested_venue_id: venue.id,
      p_customer_id: customerId,
      p_source: 'partner',
      p_requested_table_type_id: tableTypeId,
      p_starts_at: startsAt.toISOString(),
      p_party_size: payload.party_size,
      p_duration_minutes: durationMinutes,
      p_area: payload.area ?? null,
      p_special_requests: payload.message ?? null,
      p_internal_notes: null,
    })
    .single()

  if (rpcError) return dbErr(rpcError, 'create_reservation_auto')
  const rpcResult = rpcRow as CreateReservationRpcResult

  if (payload.customer.email) {
    const kind: NotificationKind | null =
      rpcResult?.status === 'confirmed' ? 'confirmation'
      : rpcResult?.status === 'pending_manual_review' ? 'received'
      : null

    if (kind) {
      try {
        const outboxId = await enqueueNotification({
          reservationId: Number(rpcResult.reservation_id),
          channel: 'email',
          kind,
          toAddress: payload.customer.email,
          payload: {
            customerName: payload.customer.full_name,
            customerEmail: payload.customer.email ?? null,
            customerPhone: payload.customer.phone ?? null,
            venue: {
              name: venue.name,
              logoUrl: venue.logo_url ?? null,
              address: venue.address ?? null,
              phone: venue.phone ?? null,
              website: venue.website ?? null,
              emailContact: venue.email_contact ?? null,
            },
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            partySize: payload.party_size,
            reservationId: rpcResult.reservation_id,
          },
        })

        after(async () => {
          await drainOne(outboxId)
          if (kind === 'confirmation') {
            await supabase.rpc('mark_confirmation_email_sent', {
              p_reservation_id: Number(rpcResult.reservation_id),
              p_mode: 'auto',
            })
          }
        })
      } catch (e) {
        console.error('[public reservations] enqueue failed:', e)
      }
    }
  }

  return ok({
    reservation_id: rpcResult?.reservation_id,
    status: rpcResult?.status,
    venue_id: venue.id,
    venue_name: venue.name,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    party_size: payload.party_size,
  }, { status: 201, headers: CORS })
}
