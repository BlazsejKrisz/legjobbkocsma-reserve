import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Row,
  Column,
  Img,
  Text,
  Hr,
  Link,
  Preview,
} from '@react-email/components'

export type EmailType = 'confirmed' | 'received' | 'updated'

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
  date: string      // already formatted, e.g. "2026-05-10"
  time: string      // already formatted, e.g. "19:00–21:00"
  partySize: number
  reservationId: string | number
  customerServiceNote?: string
}

// ─── Tokens ───────────────────────────────────────────────────────────────────

const t = {
  hu: {
    confirmed:  { subject: 'Foglalás visszaigazolva', headline: 'Foglalás visszaigazolva' },
    received:   { subject: 'Foglalási igény beérkezett', headline: 'Köszönjük a foglalási igényt!' },
    updated:    { subject: 'Foglalás módosítva', headline: 'Foglalása módosítva lett' },
    greeting: (name: string) => `Kedves ${name},`,
    confirmed_body: (venue: string) => `Foglalása a <strong>${venue}</strong> helyszínre sikeresen visszaigazolva.`,
    received_body:  (venue: string) => `Megkaptuk a foglalási igényét a <strong>${venue}</strong> helyszínre. Munkatársaink hamarosan visszaigazolják.`,
    updated_body:   (venue: string) => `Frissítettük a foglalását a <strong>${venue}</strong> helyszínre. Az új részletek alább láthatók.`,
    venue: 'Helyszín',
    date: 'Dátum',
    time: 'Időpont',
    guests: 'Vendégek száma',
    guests_unit: 'fő',
    ref: 'Foglalás',
  },
  en: {
    confirmed:  { subject: 'Reservation confirmed', headline: 'Reservation confirmed' },
    received:   { subject: 'Reservation request received', headline: 'Thank you for your request!' },
    updated:    { subject: 'Reservation updated', headline: 'Your reservation has been updated' },
    greeting: (name: string) => `Dear ${name},`,
    confirmed_body: (venue: string) => `Your reservation at <strong>${venue}</strong> is confirmed.`,
    received_body:  (venue: string) => `We received your reservation request for <strong>${venue}</strong>. Our team will confirm shortly.`,
    updated_body:   (venue: string) => `We have updated your reservation at <strong>${venue}</strong>. Please find the new details below.`,
    venue: 'Venue',
    date: 'Date',
    time: 'Time',
    guests: 'Party size',
    guests_unit: 'guests',
    ref: 'Reservation',
  },
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const styles = {
  body: {
    backgroundColor: '#f3f4f6',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    margin: '0',
    padding: '32px 16px',
  } as React.CSSProperties,
  outer: {
    maxWidth: '480px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    overflow: 'hidden' as const,
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  header: {
    backgroundColor: '#18181b',
    padding: '24px 32px',
  } as React.CSSProperties,
  headerBrand: {
    color: '#a1a1aa',
    fontSize: '11px',
    margin: '0 0 6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  } as React.CSSProperties,
  headerHeadline: {
    color: '#ffffff',
    fontSize: '20px',
    margin: '0',
    fontWeight: '600',
  } as React.CSSProperties,
  content: {
    padding: '28px 32px',
  } as React.CSSProperties,
  greeting: {
    color: '#374151',
    fontSize: '15px',
    margin: '0 0 10px',
    lineHeight: '1.6',
  } as React.CSSProperties,
  bodyText: {
    color: '#374151',
    fontSize: '14px',
    margin: '0 0 24px',
    lineHeight: '1.6',
  } as React.CSSProperties,
  table: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '16px 20px',
    marginBottom: '24px',
    width: '100%',
  } as React.CSSProperties,
  tableLabel: {
    color: '#6b7280',
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    paddingBottom: '10px',
    width: '40%',
  } as React.CSSProperties,
  tableValue: {
    color: '#111827',
    fontSize: '14px',
    fontWeight: '600',
    textAlign: 'right' as const,
    paddingBottom: '10px',
  } as React.CSSProperties,
  note: {
    borderLeft: '3px solid #6366f1',
    paddingLeft: '14px',
    marginBottom: '20px',
  } as React.CSSProperties,
  noteText: {
    color: '#374151',
    fontSize: '13px',
    margin: '0',
    lineHeight: '1.5',
  } as React.CSSProperties,
  divider: {
    borderColor: '#e5e7eb',
    margin: '0',
  } as React.CSSProperties,
  langLabel: {
    color: '#9ca3af',
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    margin: '20px 0 16px',
  } as React.CSSProperties,
  ref: {
    color: '#9ca3af',
    fontSize: '11px',
    margin: '0 0 4px',
  } as React.CSSProperties,
  footer: {
    backgroundColor: '#f9fafb',
    padding: '18px 32px',
    borderTop: '1px solid #e5e7eb',
  } as React.CSSProperties,
  footerText: {
    color: '#9ca3af',
    fontSize: '11px',
    margin: '0',
    lineHeight: '1.8',
  } as React.CSSProperties,
  footerLink: {
    color: '#9ca3af',
    textDecoration: 'none',
  } as React.CSSProperties,
}

// ─── Detail table ─────────────────────────────────────────────────────────────

function DetailTable({
  lang,
  venueName,
  date,
  time,
  partySize,
}: {
  lang: 'hu' | 'en'
  venueName: string
  date: string
  time: string
  partySize: number
}) {
  const l = t[lang]
  const rows = [
    { label: l.venue, value: venueName },
    { label: l.date, value: date },
    { label: l.time, value: time },
    { label: l.guests, value: `${partySize} ${l.guests_unit}` },
  ]

  return (
    <Section style={styles.table}>
      {rows.map((row, i) => (
        <Row key={row.label} style={i < rows.length - 1 ? {} : { paddingBottom: '0' }}>
          <Column style={{ ...styles.tableLabel, paddingBottom: i < rows.length - 1 ? '10px' : '0' }}>
            {row.label}
          </Column>
          <Column style={{ ...styles.tableValue, paddingBottom: i < rows.length - 1 ? '10px' : '0' }}>
            {row.value}
          </Column>
        </Row>
      ))}
    </Section>
  )
}

// ─── Language block ───────────────────────────────────────────────────────────

function LanguageBlock({
  lang,
  type,
  venue,
  customerName,
  date,
  time,
  partySize,
  reservationId,
  customerServiceNote,
}: ReservationEmailProps & { lang: 'hu' | 'en' }) {
  const l = t[lang]
  const bodyFn = l[`${type}_body` as keyof typeof l] as (v: string) => string

  return (
    <Section style={styles.content}>
      <Text style={styles.greeting}>{l.greeting(customerName)}</Text>
      <Text
        style={styles.bodyText}
        dangerouslySetInnerHTML={{ __html: bodyFn(venue.name) }}
      />

      <DetailTable
        lang={lang}
        venueName={venue.name}
        date={date}
        time={time}
        partySize={partySize}
      />

      {customerServiceNote && lang === 'hu' && (
        <Section style={styles.note}>
          <Text style={styles.noteText}>{customerServiceNote}</Text>
        </Section>
      )}

      <Text style={styles.ref}>
        {l.ref} #{reservationId}
      </Text>
    </Section>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReservationEmail(props: ReservationEmailProps) {
  const { type, venue } = props
  const huHeadline = t.hu[type].headline
  const huSubject = t.hu[type].subject

  return (
    <Html lang="hu">
      <Head />
      <Preview>{huSubject} — {venue.name}</Preview>
      <Body style={styles.body}>
        <div style={styles.outer}>

          {/* Header */}
          <Section style={styles.header}>
            {venue.logoUrl ? (
              <Img
                src={venue.logoUrl}
                alt={venue.name}
                height={36}
                style={{ marginBottom: '12px', maxWidth: '160px' }}
              />
            ) : (
              <Text style={styles.headerBrand}>{venue.name}</Text>
            )}
            <Text style={styles.headerHeadline}>{huHeadline}</Text>
          </Section>

          {/* Hungarian */}
          <Text style={styles.langLabel}>🇭🇺 Magyar</Text>
          <LanguageBlock {...props} lang="hu" />

          <Hr style={styles.divider} />

          {/* English */}
          <Text style={styles.langLabel}>🇬🇧 English</Text>
          <LanguageBlock {...props} lang="en" />

          {/* Footer */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              {venue.name}
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
