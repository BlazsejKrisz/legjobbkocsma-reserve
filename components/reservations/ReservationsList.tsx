'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, ChevronLeft, ChevronRight, Search, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from './StatusBadge'
import { ReservationFilters, type ReservationFilterState, DEFAULT_FILTERS } from './ReservationFilters'
import { ReservationDetail } from './ReservationDetail'
import { CreateReservationDialog } from './CreateReservationDialog'
import { useReservations } from '@/lib/hooks/reservations/useReservations'
import { formatTimeRange, formatDateYYYYMMDD, formatTimeHHMM, dayWindowUTC } from '@/lib/datetime'
import { useT } from '@/lib/i18n/useT'
import type { Venue } from '@/lib/types/venue'
import type { TableType } from '@/lib/types/table'

type Props = {
  venues: Venue[]
  tableTypes: TableType[]
  defaultVenueId?: string
  // Super-admin-only affordances (currently: hard-delete on the detail drawer).
  // Server reads getSession() and passes this flag down — never trust a
  // client-side role check, the DELETE route re-verifies via requireSuperAdmin.
  isSuperAdmin?: boolean
}

const PAGE_SIZE = 50
const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => i)

function activeTables(rt: { released_at: string | null; tables?: { name: string } | null }[]) {
  return rt.filter((r) => !r.released_at).map((r) => r.tables?.name ?? '?').join(', ')
}

export function ReservationsList({
  venues,
  tableTypes,
  defaultVenueId,
  isSuperAdmin = false,
}: Props) {
  const t = useT()
  const [filters, setFilters] = useState<ReservationFilterState>({
    ...DEFAULT_FILTERS,
    venueId: defaultVenueId ?? '',
  })
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useReservations({
    venue_id: filters.venueId || undefined,
    status: filters.status || undefined,
    source: filters.source || undefined,
    date_from: filters.dateFrom ? dayWindowUTC(filters.dateFrom).from : undefined,
    date_to:   filters.dateTo   ? dayWindowUTC(filters.dateTo).to   : undefined,
    search: filters.search || undefined,
    sort_by: filters.sortBy,
    // hide cancelled by default; explicit status filter already narrows it
    hide_cancelled: !filters.status && !filters.showCancelled,
    page,
    page_size: PAGE_SIZE,
  })

  const reservations = data?.data ?? []
  const total = data?.count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleFilterChange = useCallback((f: ReservationFilterState) => {
    setFilters(f)
    setPage(1)
  }, [])

  const handleFilterReset = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS, venueId: defaultVenueId ?? '' })
    setPage(1)
  }, [defaultVenueId])

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ReservationFilters
          filters={filters}
          venues={venues}
          onChange={handleFilterChange}
          onReset={handleFilterReset}
        />
        <Button size="sm" variant="outline" asChild className="h-8">
          <Link href="/dashboard/availability">
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t.availability.open_button}
          </Link>
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t.reservations_list.new_reservation}
        </Button>
      </div>

      {/* Count */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          {(total === 1 ? t.reservations_list.count_label_one : t.reservations_list.count_label_other)
            .replace('{count}', total.toLocaleString())}
        </p>
      )}

      {/* Table */}
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="h-9">
              <TableHead className="text-xs">
                {t.reservations_list.date_time}
              </TableHead>
              <TableHead className="text-xs">{t.reservations_list.customer}</TableHead>
              <TableHead className="text-xs hidden md:table-cell">{t.reservations_list.venue}</TableHead>
              <TableHead className="text-xs">{t.reservations_list.guests}</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">{t.reservations_list.tables}</TableHead>
              <TableHead className="text-xs hidden md:table-cell">{t.reservations_list.source}</TableHead>
              <TableHead className="text-xs">{t.reservations_list.status}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              SKELETON_ROWS.map((i) => (
                <TableRow key={i} className="h-10">
                  <TableCell colSpan={7}>
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && reservations.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  {t.reservations_list.no_reservations}
                </TableCell>
              </TableRow>
            )}

            {reservations.map((r) => (
              <TableRow
                key={r.id}
                className="h-10 cursor-pointer hover:bg-accent/50"
                onClick={() => setSelectedId(r.id)}
              >
                <TableCell className="text-xs tabular-nums">
                  {filters.sortBy === 'created_at' ? (
                    <>
                      <span className="font-medium">{formatDateYYYYMMDD(r.starts_at)}</span>
                      <br />
                      <span className="text-muted-foreground">
                        {formatTimeRange(r.starts_at, r.ends_at)}
                      </span>
                      <br />
                      <span className="text-muted-foreground/60 text-[10px]">
                        {t.reservations_list.received}: {formatDateYYYYMMDD(r.created_at)} {formatTimeHHMM(r.created_at)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{formatDateYYYYMMDD(r.starts_at)}</span>
                      <br />
                      <span className="text-muted-foreground">
                        {formatTimeRange(r.starts_at, r.ends_at)}
                      </span>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  <span className="font-medium inline-flex items-center gap-1.5">
                    {r.customers?.full_name ?? 'Walk-in'}
                    {r.special_requests && (
                      <span
                        title={`${t.reservations_list.has_message}: ${r.special_requests}`}
                        className="inline-flex shrink-0"
                      >
                        <MessageSquare className="h-3 w-3 text-info" strokeWidth={2.5} />
                      </span>
                    )}
                  </span>
                  {r.customers?.email && (
                    <>
                      <br />
                      <span className="text-muted-foreground">{r.customers.email}</span>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{r.requested_venue?.name ?? '—'}</TableCell>
                <TableCell className="text-xs text-center">{r.party_size}</TableCell>
                <TableCell className="text-xs hidden lg:table-cell">
                  {r.reservation_tables?.length
                    ? activeTables(r.reservation_tables) || <span className="text-muted-foreground">—</span>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                  {t.source[r.source] ?? r.source}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Detail drawer */}
      <ReservationDetail
        reservationId={selectedId}
        onClose={() => setSelectedId(null)}
        isSuperAdmin={isSuperAdmin}
      />

      {/* Create dialog */}
      <CreateReservationDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        venues={venues}
        tableTypes={tableTypes}
        defaultVenueId={defaultVenueId}
      />
    </div>
  )
}
