'use client'

import { useState, useDeferredValue } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCustomers } from '@/lib/hooks/customers/useCustomers'
import { useT } from '@/lib/i18n/useT'

const PAGE_SIZE = 50
const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => i)
const SKELETON_COLS = Array.from({ length: 6 }, (_, i) => i)
const TH = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'

// Customer list — driven by `useCustomers` (React Query) instead of
// fetch-in-effect.  `useDeferredValue` on the search input gives us
// concurrent rendering: the input stays responsive while the table
// re-renders with the deferred query.  `keepPreviousData` in the
// hook avoids skeletonising on every keystroke / page change.
export function CustomerList() {
  const t = useT()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [page, setPage] = useState(1)

  const { data, isPlaceholderData, isLoading } = useCustomers({
    search: deferredSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  })
  const customers = data?.data ?? []
  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Showing-skeleton condition: only on the very first load, NOT on
  // subsequent fetches (those keep the previous data visible).
  const showingSkeleton = isLoading && !data

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t.customers.search_placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            // Reset to page 1 whenever the search string changes — the
            // current page may be empty under the new filter.
            if (page !== 1) setPage(1)
          }}
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className={TH}>{t.customers.name}</th>
              <th className={`${TH} hidden sm:table-cell`}>{t.customers.email}</th>
              <th className={`${TH} hidden md:table-cell`}>{t.customers.phone}</th>
              <th className={`${TH} text-right`}>{t.customers.reservations}</th>
              <th className={`${TH} hidden text-right sm:table-cell`}>{t.customers.guests}</th>
              <th className={`${TH} hidden lg:table-cell`}>{t.customers.last_visit}</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-border/50 ${isPlaceholderData ? 'opacity-60' : ''} transition-opacity`}>
            {showingSkeleton ? (
              SKELETON_ROWS.map((i) => (
                <tr key={i}>
                  {SKELETON_COLS.map((j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {search ? t.customers.no_match : t.customers.no_customers}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {c.full_name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="hover:text-foreground transition-colors">
                        {c.email}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="hover:text-foreground transition-colors">
                        {c.phone}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {c.total_reservations}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-muted-foreground sm:table-cell">
                    {c.total_guests}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {c.last_reservation_at
                      ? format(parseISO(c.last_reservation_at), 'MMM d, yyyy')
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {total.toLocaleString()} {total === 1 ? t.customers.customer_one : t.customers.customer_other}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft />
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
