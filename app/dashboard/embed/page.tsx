import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { createAdminClient } from '@/lib/supabase/server'
import { subDays, format } from 'date-fns'

export default async function EmbedAnalyticsPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin) redirect('/dashboard')

  const supabase = createAdminClient()
  const since = format(subDays(new Date(), 29), 'yyyy-MM-dd')

  const [{ data: domainRows }, { data: eventRows }, { data: errorRows }] = await Promise.all([
    // Per-domain summary
    supabase
      .from('embed_events')
      .select('domain, event, status')
      .gte('created_at', since),
    // Daily event counts for sparkline
    supabase
      .from('embed_events')
      .select('event, created_at')
      .gte('created_at', since)
      .in('event', ['load', 'submit']),
    // Error breakdown
    supabase
      .from('embed_events')
      .select('domain, reason, code')
      .eq('event', 'error')
      .gte('created_at', since),
  ])

  // Aggregate per domain
  type DomainStats = {
    loads: number
    submits: number
    confirmed: number
    pending: number
    errors: number
  }
  const byDomain = new Map<string, DomainStats>()

  for (const row of domainRows ?? []) {
    if (!byDomain.has(row.domain)) {
      byDomain.set(row.domain, { loads: 0, submits: 0, confirmed: 0, pending: 0, errors: 0 })
    }
    const s = byDomain.get(row.domain)!
    if (row.event === 'load')   s.loads++
    if (row.event === 'submit') {
      s.submits++
      if (row.status === 'confirmed')            s.confirmed++
      if (row.status === 'pending_manual_review') s.pending++
    }
    if (row.event === 'error') s.errors++
  }

  const domains = [...byDomain.entries()]
    .map(([domain, s]) => ({
      domain,
      ...s,
      rate: s.loads > 0 ? Math.round((s.submits / s.loads) * 100) : 0,
    }))
    .sort((a, b) => b.submits - a.submits)

  // Aggregate errors by reason
  type ErrorRow = { domain: string; reason: string | null; code: number | null }
  const errorMap = new Map<string, number>()
  for (const row of (errorRows ?? []) as ErrorRow[]) {
    const key = row.reason ?? `HTTP ${row.code ?? '?'}`
    errorMap.set(key, (errorMap.get(key) ?? 0) + 1)
  }
  const errors = [...errorMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  const totalLoads   = domains.reduce((s, d) => s + d.loads, 0)
  const totalSubmits = domains.reduce((s, d) => s + d.submits, 0)
  const totalErrors  = domains.reduce((s, d) => s + d.errors, 0)
  const overallRate  = totalLoads > 0 ? Math.round((totalSubmits / totalLoads) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Embed Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Anonymous events from all embedded booking forms. Last 30 days.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Form loads',    value: totalLoads },
          { label: 'Submissions',   value: totalSubmits },
          { label: 'Conversion',    value: `${overallRate}%` },
          { label: 'Errors',        value: totalErrors },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Per-domain table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">By domain</h2>
        </div>
        {domains.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">
            No embed events recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {['Domain', 'Loads', 'Submits', 'Confirmed', 'Pending', 'Errors', 'Conv. rate'].map((h) => (
                    <th key={h} className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => (
                  <tr key={d.domain} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">{d.domain}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{d.loads}</td>
                    <td className="px-4 py-2.5 tabular-nums">{d.submits}</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-600">{d.confirmed}</td>
                    <td className="px-4 py-2.5 tabular-nums text-yellow-600">{d.pending}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-500">{d.errors}</td>
                    <td className="px-4 py-2.5 tabular-nums font-medium">{d.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Error breakdown */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">Error breakdown</h2>
            <p className="text-xs text-muted-foreground">Last 30 days, all domains</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {['Reason', 'Count'].map((h) => (
                    <th key={h} className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.reason} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{e.reason}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-500">{e.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
