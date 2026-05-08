import { after } from 'next/server'
import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireSupportOrAbove } from '@/lib/api/authz'
import { canAccessVenue } from '@/lib/auth/getSession'
import { createAdminClient } from '@/lib/supabase/server'
import { CreateFromAvailabilitySchema } from '@/lib/validators/availability'
import { enqueueNotification } from '@/lib/notifications/enqueue'
import { drainOne } from '@/lib/notifications/drain'
import { resolveChannel } from '@/lib/notifications/channel'
import { toE164 } from '@/lib/phone/parse'
import type { NotificationKind } from '@/lib/notifications/types'

type PinnedRpcResult = {
  reservation_id: number
  status: 'confirmed'
  assigned_venue_id: number
}

// Confirms a reservation that was hand-picked from the availability checker.
// Skips auto-assignment by calling create_reservation_pinned with explicit
// table ids.  Channel-aware: enqueues email or SMS based on staff choice.
export async function POST(req: Request) {
  const auth = await requireSupportOrAbove()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = CreateFromAvailabilitySchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }
  const payload = parsed.data

  if (!canAccessVenue(auth.session, payload.venue_id)) {
    return err('Forbidden', { status: 403 })
  }

  // Normalise phone to E.164 if provided.  This is what the SMS adapter
  // expects, and it's a single source of truth across the app.
  const phoneE164 = payload.customer_phone ? toE164(payload.customer_phone) : null
  if (payload.customer_phone && !phoneE164) {
    return err('Invalid phone number', { status: 400 })
  }

  if (!payload.customer_email && !phoneE164) {
    return err('Customer email or phone is required', { status: 400 })
  }

  const supabase = createAdminClient()

  // 1. Upsert customer
  const { data: customer, error: customerErr } = await supabase.rpc(
    'get_or_create_customer',
    {
      p_full_name: payload.customer_full_name,
      p_email: payload.customer_email ?? null,
      p_phone: phoneE164,
    },
  )
  if (customerErr) return dbErr(customerErr, 'get_or_create_customer')
  const customerId = customer as number

  // 2. Pin tables and create the reservation
  const { data: rpcRow, error: rpcErr } = await supabase
    .rpc('create_reservation_pinned', {
      p_venue_id: payload.venue_id,
      p_customer_id: customerId,
      p_source: payload.source,
      p_table_ids: payload.table_ids,
      p_starts_at: payload.starts_at,
      p_duration_minutes: payload.duration_minutes,
      p_party_size: payload.party_size,
      p_special_requests: payload.special_requests ?? null,
      p_internal_notes: payload.internal_notes ?? null,
      p_requested_table_type_id: payload.requested_table_type_id ?? null,
    })
    .single()
  if (rpcErr) return dbErr(rpcErr, 'create_reservation_pinned')
  const result = rpcRow as PinnedRpcResult

  // 3. Persist the chosen channel on the reservation for future reminders /
  //    cancellations.
  const channel = resolveChannel({
    desired: payload.notification_channel,
    hasEmail: !!payload.customer_email,
    hasPhone: !!phoneE164,
  })
  if (channel !== 'none') {
    await supabase
      .from('reservations')
      .update({ notification_channel: channel })
      .eq('id', result.reservation_id)
  }

  // 4. Enqueue the confirmation notification
  if (channel !== 'none') {
    const toAddress = channel === 'email' ? payload.customer_email! : phoneE164!
    const ends_at = new Date(
      new Date(payload.starts_at).getTime() + payload.duration_minutes * 60_000,
    ).toISOString()

    const { data: venue } = await supabase
      .from('venues')
      .select('name, logo_url, address, phone, website, email_contact')
      .eq('id', payload.venue_id)
      .single()

    try {
      const outboxId = await enqueueNotification({
        reservationId: Number(result.reservation_id),
        channel,
        kind: 'confirmation' as NotificationKind,
        toAddress,
        payload: {
          customerName: payload.customer_full_name,
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
          endsAt: ends_at,
          partySize: payload.party_size,
          reservationId: result.reservation_id,
        },
      })

      after(async () => {
        await drainOne(outboxId)
        await supabase.rpc('mark_confirmation_email_sent', {
          p_reservation_id: Number(result.reservation_id),
          p_mode: 'manual',
          p_channel: channel,
        })
      })
    } catch (e) {
      console.error('[from-availability] enqueue failed:', e)
    }
  }

  return ok({ data: result }, { status: 201 })
}
