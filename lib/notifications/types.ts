// Shared types for the notification outbox pipeline.
// Mirrors the enums from migration 030.

export type NotificationChannel = 'email' | 'sms'

export type NotificationKind =
  | 'confirmation'
  | 'received'
  | 'updated'
  | 'reminder'
  | 'cancellation'

export type NotificationStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'dead'

// Payload shape stored in notification_outbox.payload.
// Generic enough to render any kind of notification on either channel —
// the provider adapters pick the fields they need.
export type NotificationPayload = {
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  venue: {
    name: string
    logoUrl?: string | null
    address?: string | null
    phone?: string | null
    website?: string | null
    emailContact?: string | null
    // IANA timezone (e.g. 'Europe/Budapest') — used by the email template to
    // build a correct Google Calendar link.  Optional for back-compat with
    // older outbox rows that didn't carry it.
    timezone?: string | null
  }
  startsAt: string  // ISO
  endsAt: string    // ISO
  partySize: number
  reservationId: string | number
  // Optional, kind-specific extras
  customerServiceNote?: string
  isReassignment?: boolean
}

export type EnqueueInput = {
  reservationId: number
  channel: NotificationChannel
  kind: NotificationKind
  toAddress: string
  payload: NotificationPayload
}

// Provider-level send result.  Keeps the drain logic agnostic of which
// SMS/email provider is configured.
export type SendResult =
  | { ok: true; providerId?: string }
  | { ok: false; transient: true; error: string }   // retry-worthy
  | { ok: false; transient: false; error: string }  // dead, don't retry

// Exponential backoff schedule for failed attempts.
// Attempt 1 fires immediately via after().  Attempt 2 waits 30s, then 2m,
// 10m, 1h.  After attempt 5 the row is marked 'dead' and surfaces on the
// observability dashboard.
export const RETRY_BACKOFF_SECONDS = [0, 30, 120, 600, 3600] as const
export const MAX_ATTEMPTS = RETRY_BACKOFF_SECONDS.length
