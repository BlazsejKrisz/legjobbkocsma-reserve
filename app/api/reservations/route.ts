import { after } from 'next/server'
import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireAuth } from '@/lib/api/authz'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { CreateReservationSchema } from '@/lib/validators/reservations'
import { canAccessVenue } from '@/lib/auth/getSession'
import { enqueueNotification } from '@/lib/notifications/enqueue'
import { drainOne } from '@/lib/notifications/drain'
import { resolveChannel, defaultChannel } from '@/lib/notifications/channel'
import { toE164 } from '@/lib/phone/parse'
import type { NotificationKind } from '@/lib/notifications/types'
import { sanitizePostgrestSearch } from '@/lib/api/postgrestSearch'

type CreateReservationRpcResult = {
  reservation_id: number
  status: 'confirmed' | 'pending_manual_review'
  assigned_venue_id: number | null
  overflow_reason: string | null
}

const RESERVATION_SELECT = `
  id, requested_venue_id, assigned_venue_id, customer_id,
  starts_at, ends_at, party_size, status, source, overflow_reason,
  special_requests, internal_notes,
  auto_confirmation_email_sent_at, manual_confirmation_email_sent_at,
  created_at,
  customers (id, full_name, email, phone, created_at),
  requested_venue:requested_venue_id (id, name),
  assigned_venue:assigned_venue_id (id, name),
  reservation_tables (
    id, reservation_id, table_id, released_at,
    tables (id, name, area, capacity_min, capacity_max)
  )
`

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const venueId = url.searchParams.get('venue_id') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const source = url.searchParams.get('source') ?? undefined
  const dateFrom = url.searchParams.get('date_from') ?? undefined
  const dateTo = url.searchParams.get('date_to') ?? undefined
  const search = url.searchParams.get('search') ?? undefined
  const hideCancelled = url.searchParams.get('hide_cancelled') === '1'
  const sortBy = url.searchParams.get('sort_by') === 'starts_at' ? 'starts_at' : 'created_at'
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(Number(url.searchParams.get('page_size') ?? '50'), 100)

  const supabase = await createClient()

  let query = supabase
    .from('reservations')
    .select(RESERVATION_SELECT, { count: 'exact' })
    .order(sortBy, { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (auth.session.isVenueStaff && auth.session.venueIds.length > 0) {
    query = query.in('requested_venue_id', auth.session.venueIds)
  }
  if (venueId) query = query.eq('requested_venue_id', venueId)
  if (status) query = query.eq('status', status)
  // Hide cancelled by default — only applies when no explicit status filter is
  // set (otherwise we'd contradict the user's pick of "status = cancelled").
  else if (hideCancelled) query = query.neq('status', 'cancelled')
  if (source) query = query.eq('source', source)
  if (dateFrom) query = query.gte(sortBy, dateFrom)
  if (dateTo) query = query.lte(sortBy, dateTo)
  const safeSearch = sanitizePostgrestSearch(search)
  if (safeSearch) {
    query = query.or(
      `customers.full_name.ilike.%${safeSearch}%,customers.email.ilike.%${safeSearch}%,customers.phone.ilike.%${safeSearch}%`,
    )
  }

  const { data, error, count } = await query
  if (error) return dbErr(error)

  return ok({ data: data ?? [], count: count ?? 0, page, pageSize })
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = CreateReservationSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const payload = parsed.data

  if (!canAccessVenue(auth.session, payload.venue_id)) {
    return err('Forbidden', { status: 403 })
  }

  const supabase = createAdminClient()

  // get_or_create_customer requires at least email or phone
  if (!payload.customer_email && !payload.customer_phone) {
    return err('Customer email or phone is required', { status: 400 })
  }

  const { data: customer, error: customerError } = await supabase.rpc(
    'get_or_create_customer',
    {
      p_full_name: payload.customer_full_name ?? null,
      p_email: payload.customer_email ?? null,
      p_phone: payload.customer_phone ?? null,
    },
  )
  if (customerError) return dbErr(customerError, 'get_or_create_customer')
  const customerId = customer as number

  const durationMinutes = Math.round(
    (new Date(payload.ends_at).getTime() - new Date(payload.starts_at).getTime()) / 60_000,
  )

  const { data: rpcRow, error: rpcError } = await supabase
    .rpc('create_reservation_auto', {
      p_requested_venue_id: payload.venue_id,
      p_customer_id: customerId,
      p_source: payload.source,
      p_requested_table_type_id: payload.requested_table_type_id ?? null,
      p_starts_at: payload.starts_at,
      p_party_size: payload.party_size,
      p_duration_minutes: durationMinutes,
      p_area: payload.area ?? null,
      p_special_requests: payload.special_requests ?? null,
      p_internal_notes: payload.internal_notes ?? null,
      p_skip_party_size_limit: true,
    })
    .single()

  if (rpcError) return dbErr(rpcError, 'create_reservation_auto')
  const rpcResult = rpcRow as CreateReservationRpcResult

  // Decide channel: explicit notification_channel from the new picker UI
  // takes precedence; falls back to the legacy send_confirmation_email
  // toggle (which means "email if address present").
  const phoneE164 = payload.customer_phone ? toE164(payload.customer_phone) : null
  const desiredChannel =
    payload.notification_channel ??
    (payload.send_confirmation_email
      ? defaultChannel({ hasEmail: !!payload.customer_email, hasPhone: !!phoneE164 })
      : 'none')
  const channel = resolveChannel({
    desired: desiredChannel,
    hasEmail: !!payload.customer_email,
    hasPhone: !!phoneE164,
  })

  // Persist channel choice on the reservation for reminders / cancellations
  if (channel !== 'none') {
    await supabase
      .from('reservations')
      .update({ notification_channel: channel })
      .eq('id', rpcResult.reservation_id)
  }

  // Enqueue the appropriate notification.  Sends via after() so the API
  // response returns immediately; the cron is a safety net for orphans.
  if (channel !== 'none') {
    const toAddress = channel === 'email' ? payload.customer_email! : phoneE164!

    const { data: venue } = await supabase
      .from('venues')
      .select('name, logo_url, address, phone, website, email_contact')
      .eq('id', payload.venue_id)
      .single()

    const kind: NotificationKind | null =
      rpcResult.status === 'confirmed' ? 'confirmation'
      : rpcResult.status === 'pending_manual_review' ? 'received'
      : null

    if (kind) {
      try {
        const outboxId = await enqueueNotification({
          reservationId: Number(rpcResult.reservation_id),
          channel,
          kind,
          toAddress,
          payload: {
            customerName: payload.customer_full_name ?? 'Guest',
            customerEmail: payload.customer_email ?? null,
            customerPhone: phoneE164,
            venue: {
              name: venue?.name ?? '',
              logoUrl: venue?.logo_url ?? null,
              address: venue?.address ?? null,
              phone: venue?.phone ?? null,
              website: venue?.website ?? null,
              emailContact: venue?.email_contact ?? null,
            },
            startsAt: payload.starts_at,
            endsAt: payload.ends_at,
            partySize: payload.party_size,
            reservationId: rpcResult.reservation_id,
          },
        })

        // Fire after the response — customer sees toast immediately, email
        // lands in inbox 1-3s later.  drainOne is idempotent against the
        // cron retry path.
        after(async () => {
          await drainOne(outboxId)
          if (kind === 'confirmation') {
            await supabase.rpc('mark_confirmation_email_sent', {
              p_reservation_id: Number(rpcResult.reservation_id),
              p_mode: 'auto',
              p_channel: channel,
            })
          }
        })
      } catch (e) {
        // Enqueue failed — log but don't fail the booking.  Staff can
        // manually trigger via "Confirm + email" if needed.
        console.error('[reservations] enqueue failed:', e)
      }
    }
  }

  return ok({ data: rpcResult }, { status: 201 })
}
