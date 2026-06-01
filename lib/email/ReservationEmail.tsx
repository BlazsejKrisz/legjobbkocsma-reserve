import {
  Html,
  Head,
  Body,
  Section,
  Row,
  Column,
  Img,
  Text,
  Hr,
  Link,
  Preview,
} from '@react-email/components'

export type EmailType = 'confirmed' | 'received' | 'updated' | 'cancelled'

export interface VenueBranding {
  name: string
  logoUrl?: string | null
  address?: string | null
  phone?: string | null
  website?: string | null
  emailContact?: string | null
}

export interface ReservationEmailProps {
  type: EmailType
  venue: VenueBranding
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  date: string      // already formatted, e.g. "2026.05.10"
  time: string      // already formatted, e.g. "19:00–21:00"
  partySize: number
  reservationId: string | number
  customerServiceNote?: string
  // Raw ISO timestamps + venue IANA timezone — used to build the "Add to
  // Google Calendar" button.  Optional so old outbox rows (queued before
  // these were added to the payload) still render without crashing.
  startsAt?: string
  endsAt?: string
  venueTimezone?: string
}

// ─── Copy ──────────────────────────────────────────────────────────────────────
//
// Bilingual: Hungarian primary (most guests are HU), English secondary in
// lighter style.  Labels in the details / customer cards use slash form
// ("Helyszín / Venue") so we don't repeat the whole table twice.

const copy = {
  confirmed: {
    huHeading:  'Foglalása visszaigazolva',
    enHeading:  'Reservation confirmed',
    huThanks:   'Köszönjük, hogy minket választott! Várjuk Önt és társaságát.',
    enThanks:   'Thank you for your reservation! We look forward to welcoming you.',
  },
  received: {
    huHeading:  'Foglalási igényét megkaptuk',
    enHeading:  'We received your request',
    huThanks:   'Köszönjük a foglalási igényét! Munkatársaink hamarosan felveszik Önnel a kapcsolatot a végleges visszaigazoláshoz.',
    enThanks:   'Thank you for your request! Our team will get back to you shortly with a final confirmation.',
  },
  updated: {
    huHeading:  'Foglalása módosítva és megerősítve',
    enHeading:  'Reservation updated and reconfirmed',
    huThanks:   'Frissítettük a foglalását. Az új részletek alább láthatók — minden más változatlan.',
    enThanks:   'We have updated your reservation. The new details are below — everything else stays the same.',
  },
  cancelled: {
    huHeading:  'Foglalása lemondva',
    enHeading:  'Reservation cancelled',
    huThanks:   'Tájékoztatjuk, hogy az alábbi foglalása lemondásra került. Sajnáljuk, hogy ezúttal nem tudjuk fogadni — kérjük, foglaljon nálunk legközelebb!',
    enThanks:   'We\'re letting you know your reservation has been cancelled. We\'re sorry we couldn\'t host you this time — please book with us again!',
  },
} as const

// ─── Styles ────────────────────────────────────────────────────────────────────

const COLORS = {
  bg:        '#f3f4f6',
  card:      '#ffffff',
  cardEdge:  '#e5e7eb',
  inkDark:   '#111827',
  inkBody:   '#374151',
  inkMute:   '#6b7280',
  inkFaint:  '#9ca3af',
  surface:   '#f9fafb',
  brand:     '#18181b',
  accent:    '#6366f1',
  callout:   '#fef3c7',
  calloutFg: '#92400e',
}

const styles = {
  body: {
    backgroundColor: COLORS.bg,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    margin: 0,
    padding: '32px 16px',
  } as React.CSSProperties,

  outer: {
    maxWidth: '520px',
    margin: '0 auto',
    backgroundColor: COLORS.card,
    borderRadius: '12px',
    overflow: 'hidden' as const,
    border: `1px solid ${COLORS.cardEdge}`,
  } as React.CSSProperties,

  header: {
    backgroundColor: COLORS.brand,
    padding: '28px 32px',
  } as React.CSSProperties,

  headerHu: {
    color: '#ffffff',
    fontSize: '22px',
    margin: '14px 0 4px',
    fontWeight: 700,
    lineHeight: 1.3,
  } as React.CSSProperties,

  headerEn: {
    color: '#a1a1aa',
    fontSize: '13px',
    margin: 0,
    fontWeight: 500,
    lineHeight: 1.4,
  } as React.CSSProperties,

  content: { padding: '28px 32px' } as React.CSSProperties,

  greeting: {
    color: COLORS.inkDark,
    fontSize: '16px',
    margin: '0 0 14px',
    lineHeight: 1.5,
    fontWeight: 600,
  } as React.CSSProperties,

  thanksHu: {
    color: COLORS.inkBody,
    fontSize: '14px',
    margin: '0 0 10px',
    lineHeight: 1.6,
  } as React.CSSProperties,

  thanksEn: {
    color: COLORS.inkMute,
    fontSize: '13px',
    margin: '0 0 22px',
    lineHeight: 1.6,
    fontStyle: 'italic' as const,
  } as React.CSSProperties,

  cardTitle: {
    color: COLORS.inkMute,
    fontSize: '11px',
    margin: '0 0 8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    fontWeight: 600,
  } as React.CSSProperties,

  detailsBox: {
    backgroundColor: COLORS.surface,
    borderRadius: '10px',
    padding: '16px 20px',
    marginBottom: '20px',
    width: '100%',
  } as React.CSSProperties,

  rowLabel: {
    color: COLORS.inkMute,
    fontSize: '12px',
    paddingBottom: '10px',
    width: '45%',
    verticalAlign: 'top' as const,
  } as React.CSSProperties,

  rowLabelEn: {
    color: COLORS.inkFaint,
    fontSize: '11px',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,

  rowValue: {
    color: COLORS.inkDark,
    fontSize: '14px',
    fontWeight: 600,
    textAlign: 'right' as const,
    paddingBottom: '10px',
    verticalAlign: 'top' as const,
  } as React.CSSProperties,

  callout: {
    backgroundColor: COLORS.callout,
    borderRadius: '8px',
    padding: '14px 18px',
    marginBottom: '8px',
  } as React.CSSProperties,

  calloutTitle: {
    color: COLORS.calloutFg,
    fontSize: '12px',
    margin: '0 0 4px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,

  calloutText: {
    color: COLORS.calloutFg,
    fontSize: '13px',
    margin: '0 0 4px',
    lineHeight: 1.5,
  } as React.CSSProperties,

  calloutTextEn: {
    color: COLORS.calloutFg,
    fontSize: '12px',
    margin: '6px 0 0',
    lineHeight: 1.5,
    fontStyle: 'italic' as const,
    opacity: 0.85,
  } as React.CSSProperties,

  calloutLink: {
    color: COLORS.calloutFg,
    fontWeight: 700,
    textDecoration: 'none',
  } as React.CSSProperties,

  note: {
    borderLeft: `3px solid ${COLORS.accent}`,
    paddingLeft: '14px',
    marginBottom: '20px',
  } as React.CSSProperties,

  gcalWrap: {
    textAlign: 'center' as const,
    margin: '0 0 22px',
  } as React.CSSProperties,

  gcalButton: {
    display: 'inline-block',
    backgroundColor: '#1a73e8',
    color: '#ffffff',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 600,
    padding: '10px 20px',
    borderRadius: '8px',
    lineHeight: 1,
  } as React.CSSProperties,

  gcalHint: {
    color: COLORS.inkFaint,
    fontSize: '11px',
    margin: '6px 0 0',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,

  noteText: {
    color: COLORS.inkBody,
    fontSize: '13px',
    margin: 0,
    lineHeight: 1.5,
  } as React.CSSProperties,

  ref: {
    color: COLORS.inkFaint,
    fontSize: '11px',
    margin: '20px 0 0',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  divider: {
    borderColor: COLORS.cardEdge,
    margin: 0,
  } as React.CSSProperties,

  footer: {
    backgroundColor: COLORS.surface,
    padding: '18px 32px',
    borderTop: `1px solid ${COLORS.cardEdge}`,
  } as React.CSSProperties,

  footerText: {
    color: COLORS.inkFaint,
    fontSize: '11px',
    margin: 0,
    lineHeight: 1.7,
  } as React.CSSProperties,

  footerLink: {
    color: COLORS.inkFaint,
    textDecoration: 'none',
  } as React.CSSProperties,
}

// ─── Google Calendar URL ──────────────────────────────────────────────────────
//
// Google's calendar/render?action=TEMPLATE accepts dates as
// "YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS" interpreted in the timezone given by
// `ctz`.  We format the ISO timestamps as wall-clock time in the venue's
// timezone (Europe/Budapest by default) so the event lands at the same
// hour the guest sees in the email regardless of who's adding it.

function formatLocalForGCal(isoUtc: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(isoUtc))
  const o: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value
  // Some engines emit "24" for midnight — Google rejects it, normalise to "00".
  if (o.hour === '24') o.hour = '00'
  return `${o.year}${o.month}${o.day}T${o.hour}${o.minute}${o.second}`
}

// ─── Gmail Email Markup (schema.org JSON-LD) ─────────────────────────────────
//
// When Gmail finds a script[type="application/ld+json"] with a recognised
// reservation type in the email head, it renders the rich card the user
// asked for (the one with venue name, address, "Add to Calendar" and
// "Directions" buttons) at the top of the conversation.  Other clients
// (Outlook, Apple Mail) ignore the tag — they still see the in-body
// fallback button.
//
// Spec: https://developers.google.com/gmail/markup/reference/food-establishment-reservation
//
// Only emit for `confirmed` and `updated`.  A `received` reservation is
// still pending manual review (no firm time yet) so a calendar card would
// be misleading; `cancelled` doesn't belong in a calendar.

function buildReservationMarkup(args: {
  type: EmailType
  startsAt: string
  endsAt: string
  venue: VenueBranding
  customerName: string
  partySize: number
  reservationId: string | number
}): string | null {
  if (args.type !== 'confirmed' && args.type !== 'updated') return null

  const obj: Record<string, unknown> = {
    '@context': 'http://schema.org',
    '@type': 'FoodEstablishmentReservation',
    reservationNumber: String(args.reservationId),
    reservationStatus: 'http://schema.org/ReservationConfirmed',
    underName: { '@type': 'Person', name: args.customerName },
    reservationFor: {
      '@type': 'FoodEstablishment',
      name: args.venue.name,
      ...(args.venue.address
        ? { address: { '@type': 'PostalAddress', streetAddress: args.venue.address } }
        : {}),
      ...(args.venue.phone ? { telephone: args.venue.phone } : {}),
      ...(args.venue.website ? { url: args.venue.website } : {}),
    },
    startTime: args.startsAt,
    endTime: args.endsAt,
    partySize: args.partySize,
  }

  // Escape `<` so a venue/customer name containing "</script>" can't break
  // out of the script tag.  JSON.stringify handles quote/backslash escaping.
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}

function buildGoogleCalendarUrl(args: {
  startsAt: string
  endsAt: string
  tz: string
  venueName: string
  venueAddress?: string | null
  partySize: number
  reservationId: string | number
}): string {
  const start = formatLocalForGCal(args.startsAt, args.tz)
  const end   = formatLocalForGCal(args.endsAt, args.tz)
  const location = args.venueAddress
    ? `${args.venueName}, ${args.venueAddress}`
    : args.venueName
  const details = `Foglalás száma / Reservation #${args.reservationId}\nLétszám / Party size: ${args.partySize}`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text:    `Foglalás — ${args.venueName}`,
    dates:   `${start}/${end}`,
    details,
    location,
    ctz:     args.tz,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// ─── Building blocks ───────────────────────────────────────────────────────────

function DetailRow({
  labelHu,
  labelEn,
  value,
  isLast,
}: {
  labelHu: string
  labelEn: string
  value: string | number
  isLast?: boolean
}) {
  const pad = isLast ? '0' : '10px'
  return (
    <Row>
      <Column style={{ ...styles.rowLabel, paddingBottom: pad }}>
        {labelHu}
        <br />
        <span style={styles.rowLabelEn}>{labelEn}</span>
      </Column>
      <Column style={{ ...styles.rowValue, paddingBottom: pad }}>{value}</Column>
    </Row>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReservationEmail(props: ReservationEmailProps) {
  const {
    type,
    venue,
    customerName,
    customerEmail,
    customerPhone,
    date,
    time,
    partySize,
    reservationId,
    customerServiceNote,
    startsAt,
    endsAt,
    venueTimezone,
  } = props

  const c = copy[type]
  const cancellationNumber = venue.phone ?? venue.emailContact ?? null

  // Only confirmed/updated emails get the calendar button — "received" isn't
  // a final time, and "cancelled" obviously shouldn't add anything.  Needs
  // the raw ISO timestamps, which old outbox rows may lack.
  const showCalendarExtras =
    (type === 'confirmed' || type === 'updated') && !!startsAt && !!endsAt
  const gcalUrl = showCalendarExtras
    ? buildGoogleCalendarUrl({
        startsAt: startsAt!,
        endsAt:   endsAt!,
        tz:       venueTimezone || 'Europe/Budapest',
        venueName:    venue.name,
        venueAddress: venue.address,
        partySize,
        reservationId,
      })
    : null
  const reservationMarkup = showCalendarExtras
    ? buildReservationMarkup({
        type,
        startsAt: startsAt!,
        endsAt:   endsAt!,
        venue,
        customerName,
        partySize,
        reservationId,
      })
    : null

  return (
    <Html lang="hu">
      <Head>
        {reservationMarkup && (
          <script
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: reservationMarkup }}
          />
        )}
      </Head>
      <Preview>{c.huHeading} — {venue.name}</Preview>
      <Body style={styles.body}>
        <div style={styles.outer}>

          {/* ─── Header ──────────────────────────────────────────────── */}
          <Section style={styles.header}>
            {venue.logoUrl ? (
              <Img
                src={venue.logoUrl}
                alt={venue.name}
                height={36}
                style={{ display: 'block', marginBottom: '4px', maxWidth: '180px' }}
              />
            ) : (
              <Text
                style={{
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 700,
                  margin: '0',
                  letterSpacing: '0.02em',
                }}
              >
                {venue.name}
              </Text>
            )}
            <Text style={styles.headerHu}>{c.huHeading}</Text>
            <Text style={styles.headerEn}>{c.enHeading}</Text>
          </Section>

          {/* ─── Greeting + thank-you ────────────────────────────────── */}
          <Section style={styles.content}>
            <Text style={styles.greeting}>Kedves {customerName}!</Text>
            <Text style={styles.thanksHu}>{c.huThanks}</Text>
            <Text style={styles.thanksEn}>Dear {customerName} — {c.enThanks}</Text>

            {/* ─── Reservation details ───────────────────────────────── */}
            <Text style={styles.cardTitle}>Foglalás · Reservation</Text>
            <Section style={styles.detailsBox}>
              <DetailRow labelHu="Helyszín"  labelEn="Venue"      value={venue.name} />
              <DetailRow labelHu="Dátum"     labelEn="Date"       value={date} />
              <DetailRow labelHu="Időpont"   labelEn="Time"       value={time} />
              <DetailRow labelHu="Létszám"   labelEn="Party size" value={`${partySize} fő / ${partySize} guests`} isLast />
            </Section>

            {/* ─── Customer info (only when we have at least one field) ─ */}
            {(customerName || customerEmail || customerPhone) && (
              <>
                <Text style={styles.cardTitle}>Vendég adatai · Guest details</Text>
                <Section style={styles.detailsBox}>
                  <DetailRow labelHu="Név"     labelEn="Name"  value={customerName} />
                  {customerEmail && (
                    <DetailRow labelHu="Email"   labelEn="Email"  value={customerEmail} />
                  )}
                  <DetailRow
                    labelHu="Telefon"
                    labelEn="Phone"
                    value={customerPhone ?? '—'}
                    isLast
                  />
                </Section>
              </>
            )}

            {/* ─── Add to Google Calendar ─────────────────────────────── */}
            {gcalUrl && (
              <Section style={styles.gcalWrap}>
                <Link href={gcalUrl} style={styles.gcalButton}>
                  Hozzáadás Google Naptárhoz · Add to Google Calendar
                </Link>
                <Text style={styles.gcalHint}>
                  A foglalás dátuma, időpontja és helyszíne automatikusan bekerül a naptárba.
                </Text>
              </Section>
            )}

            {/* ─── Customer-service note (reassignments) ─────────────── */}
            {customerServiceNote && (
              <Section style={styles.note}>
                <Text style={styles.noteText}>{customerServiceNote}</Text>
              </Section>
            )}

            {/* ─── Cancellation guidance ─────────────────────────────── */}
            {type !== 'received' && type !== 'cancelled' && cancellationNumber && (
              <Section style={styles.callout}>
                <Text style={styles.calloutTitle}>Lemondás · Cancellation</Text>
                <Text style={styles.calloutText}>
                  Ha nem tud eljönni vagy módosítani szeretne a foglaláson, kérjük hívja a{' '}
                  <Link href={`tel:${cancellationNumber}`} style={styles.calloutLink}>
                    {cancellationNumber}
                  </Link>{' '}
                  számot.
                </Text>
                <Text style={styles.calloutTextEn}>
                  To cancel or modify your reservation, please call{' '}
                  <Link href={`tel:${cancellationNumber}`} style={styles.calloutLink}>
                    {cancellationNumber}
                  </Link>
                  .
                </Text>
              </Section>
            )}

            <Text style={styles.ref}>Foglalás · Reservation #{reservationId}</Text>
          </Section>

          <Hr style={styles.divider} />

          {/* ─── Footer ──────────────────────────────────────────────── */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              <strong style={{ color: COLORS.inkMute }}>{venue.name}</strong>
              {venue.address ? ` · ${venue.address}` : ''}
              {venue.phone ? (
                <>
                  {' · '}
                  <Link href={`tel:${venue.phone}`} style={styles.footerLink}>
                    {venue.phone}
                  </Link>
                </>
              ) : null}
              {venue.website ? (
                <>
                  {' · '}
                  <Link href={venue.website} style={styles.footerLink}>
                    {venue.website.replace(/^https?:\/\//, '')}
                  </Link>
                </>
              ) : null}
            </Text>
          </Section>

        </div>
      </Body>
    </Html>
  )
}
