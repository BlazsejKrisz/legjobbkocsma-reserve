'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useT } from '@/lib/i18n/useT'

type Customer = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  created_at: string
  total_reservations: number
  last_reservation_at: string | null
  total_guests: number
}

const PAGE_SIZE = 50
const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => i)
const SKELETON_COLS = Array.from({ length: 6 }, (_, i) => i)
const TH = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'

export function CustomerList() {
  const t = useT()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const debouncedSearch = useDebounce(search, 300)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)

    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
    if (debouncedSearch) params.set('search', debouncedSearch)

    fetch(`/api/customers?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json) => {
        setCustomers(json.data ?? [])
        setTotal(json.count ?? 0)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setLoading(false)
      })

    return () => controller.abort()
  }, [debouncedSearch, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t.customers.search_placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
          <tbody className="divide-y divide-border/50">
            {loading ? (
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
        <span>{total} customer{total !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
