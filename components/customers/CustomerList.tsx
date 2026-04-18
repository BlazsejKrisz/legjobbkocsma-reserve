'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useDebounce } from '@/lib/hooks/useDebounce'

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

export function CustomerList() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const debouncedSearch = useDebounce(search, 300)

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) })
      if (q) params.set('search', q)
      const res = await fetch(`/api/customers?${params}`)
      const json = await res.json()
      setCustomers(json.data ?? [])
      setTotal(json.count ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  useEffect(() => {
    load(debouncedSearch, page)
  }, [debouncedSearch, page, load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="hidden px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Email</th>
              <th className="hidden px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Phone</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reservations</th>
              <th className="hidden px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Guests</th>
              <th className="hidden px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">Last visit</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {search ? 'No customers match your search.' : 'No customers yet.'}
                </td>
              </tr>
            ) : (
              customers.map((c, idx) => (
                <tr
                  key={c.id}
                  className={`${idx !== customers.length - 1 ? 'border-b border-border/50' : ''} hover:bg-muted/20 transition-colors`}
                >
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
