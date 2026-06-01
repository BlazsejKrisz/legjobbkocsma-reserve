import React from 'react'
import { render } from '@react-email/render'
import { resend, buildFromHeader } from './client'
import { ReservationEmail, VenueBranding } from './ReservationEmail'
import { formatDateYYYYMMDD, formatTimeRange } from '@/lib/datetime/businessTime'
import { redactEmail } from '@/lib/log/redact'

export type { VenueBranding }

export interface ConfirmationEmailData {
  to: string
  customerName: string
  venue: VenueBranding
  startsAt: string
  endsAt: string
  partySize: number
  reservationId: string | number
  isReassignment?: boolean
  customerServiceNote?: string
}

export async function sendConfirmationEmail(data: ConfirmationEmailData): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] Skipping — RESEND_API_KEY not configured')
    return false
  }

  const {
    to, customerName, venue, startsAt, endsAt,
    partySize, reservationId, isReassignment = false, customerServiceNote,
  } = data

  const date = formatDateYYYYMMDD(startsAt)
  const time = formatTimeRange(startsAt, endsAt)
  const type = isReassignment ? 'updated' : 'confirmed'
  const subject = isReassignment
    ? `Foglalás módosítva — ${venue.name}`
    : `Foglalás visszaigazolva — ${venue.name}`

  const html = await render(
    React.createElement(ReservationEmail, {
      type,
      venue,
      customerName,
      date,
      time,
      partySize,
      reservationId,
      customerServiceNote,
      startsAt,
      endsAt,
    }),
  )

  try {
    await resend.emails.send({
      from: buildFromHeader(venue.name),
      to,
      subject,
      html,
      ...(venue.emailContact ? { reply_to: venue.emailContact } : {}),
    })
    console.log(`[email] Confirmation sent to ${redactEmail(to)} (reservation #${reservationId})`)
    return true
  } catch (err) {
    console.error('[email] Failed to send confirmation:', err)
    return false
  }
}

export interface ReceivedEmailData {
  to: string
  customerName: string
  venue: VenueBranding
  startsAt: string
  endsAt: string
  partySize: number
  reservationId: string | number
}

export async function sendReceivedEmail(data: ReceivedEmailData): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] Skipping — RESEND_API_KEY not configured')
    return false
  }

  const { to, customerName, venue, startsAt, endsAt, partySize, reservationId } = data

  const date = formatDateYYYYMMDD(startsAt)
  const time = formatTimeRange(startsAt, endsAt)
  const subject = `Foglalási igény beérkezett — ${venue.name}`

  const html = await render(
    React.createElement(ReservationEmail, {
      type: 'received',
      venue,
      customerName,
      date,
      time,
      partySize,
      reservationId,
      startsAt,
      endsAt,
    }),
  )

  try {
    await resend.emails.send({
      from: buildFromHeader(venue.name),
      to,
      subject,
      html,
      ...(venue.emailContact ? { reply_to: venue.emailContact } : {}),
    })
    console.log(`[email] Received email sent to ${redactEmail(to)} (reservation #${reservationId})`)
    return true
  } catch (err) {
    console.error('[email] Failed to send received email:', err)
    return false
  }
}
