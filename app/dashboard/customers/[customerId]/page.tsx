import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ChevronLeft } from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-emerald-500/12 text-emerald-400',
  completed: 'bg-blue-500/12 text-blue-400',
  cancelled: 'bg-red-500/12 text-red-400',
  pending_manual_review: 'bg-amber-500/12 text-amber-400',
  no_show: 'bg-zinc-500/12 text-zinc-400',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-secondary text-muted-foreground'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

type Params = { params: Promise<{ customerId: string }> }

export default async function CustomerDetailPage({ params }: Params) {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin && !session.isSupport) redirect('/dashboard')

  const { customerId } = await params

  const supabase = await createClient()

  const RESERVATION_SELECT = `
    id, starts_at, ends_at, party_size, status, source, overflow_reason,
    special_requests, internal_notes, created_at,
    requested_venue:requested_venue_id (id, name),
    assigned_venue:assigned_venue_id (id, name)
  `

  const [customerResult, reservationsResult] = await Promise.all([
    supabase
      .from('customers')
      .select('id, full_name, email, phone, created_at')
      .eq('id', customerId)
      .single(),
    supabase
      .from('reservations')
      .select(RESERVATION_SELECT)
      .eq('customer_id', customerId)
      .order('starts_at', { ascending: false }),
  ])

  if (customerResult.error || !customerResult.data) notFound()

  const customer = customerResult.data
  const reservations = reservationsResult.data ?? []
  const totalGuests = reservations.reduce((sum, r) => sum + r.party_size, 0)
  const completedCount = reservations.filter((r) => r.status === 'completed').length
  const cancelledCount = reservations.filter((r) => r.status === 'cancelled').length

  return (
    <div className="flex flex-col gap-6">
      {/* Back */}
      <Link
        href="/dashboard/customers"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ChevronLeft className="h-4 w-4" />
        All customers
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">{customer.full_name}</h1>
        <p className="text-sm text-muted-foreground">
          Customer since {format(parseISO(customer.created_at), 'MMM d, yyyy')}
        </p>
      </div>

      {/* Contact + summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Contact info */}
        <div className="rounded-lg border border-border bg-card px-4 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Contact</p>
          {customer.email && (
            <div>
              <p className="text-[10px] text-muted-foreground">Email</p>
              <a href={`mailto:${customer.email}`} className="text-sm text-foreground hover:text-primary transition-colors">
                {customer.email}
              </a>
            </div>
          )}
          {customer.phone && (
            <div>
              <p className="text-[10px] text-muted-foreground">Phone</p>
              <a href={`tel:${customer.phone}`} className="text-sm text-foreground hover:text-primary transition-colors">
                {customer.phone}
              </a>
            </div>
          )}
          {!customer.email && !customer.phone && (
            <p className="text-sm text-muted-foreground">No contact info</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total reservations', value: reservations.length },
            { label: 'Total guests', value: totalGuests },
            { label: 'Completed', value: completedCount },
            { label: 'Cancelled', value: cancelledCount },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-card px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Reservation history */}
      <div>
        <p className="mb-3 text-sm font-semibold text-foreground">Reservation history</p>
        {reservations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reservations yet.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Time</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Venue</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Guests</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Source</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r, idx) => {
                  const venue = (r.assigned_venue as unknown as { id: number; name: string } | null)
                    ?? (r.requested_venue as unknown as { id: number; name: string } | null)
                  const startsAt = parseISO(r.starts_at)
                  const endsAt = parseISO(r.ends_at)
                  return (
                    <tr
                      key={r.id}
                      className={`${idx !== reservations.length - 1 ? 'border-b border-border/50' : ''} hover:bg-muted/20 transition-colors`}
                    >
                      <td className="px-4 py-3 text-foreground">{format(startsAt, 'MMM d, yyyy')}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {format(startsAt, 'HH:mm')}–{format(endsAt, 'HH:mm')}
                      </td>
                      <td className="px-4 py-3 text-foreground">{venue?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-foreground tabular-nums">{r.party_size}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{r.source ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
