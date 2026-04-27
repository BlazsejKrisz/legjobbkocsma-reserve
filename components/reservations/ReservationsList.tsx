'use client'

import { useState, useCallback } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
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
import { SOURCE_LABELS } from '@/lib/domain/reservation'
import type { Venue } from '@/lib/types/venue'
import type { TableType } from '@/lib/types/table'

type Props = {
  venues: Venue[]
  tableTypes: TableType[]
  defaultVenueId?: string
  showVenueColumn?: boolean
}

const PAGE_SIZE = 50

export function ReservationsList({
  venues,
  tableTypes,
  defaultVenueId,
  showVenueColumn = true,
}: Props) {
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

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ReservationFilters
          filters={filters}
          venues={venues}
          onChange={handleFilterChange}
          onReset={() => { setFilters({ ...DEFAULT_FILTERS, venueId: defaultVenueId ?? '' }); setPage(1) }}
        />
        <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New reservation
        </Button>
      </div>

      {/* Count */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString()} reservation{total !== 1 ? 's' : ''}
        </p>
      )}

      {/* Table */}
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="h-9">
              <TableHead className="text-xs">
                {filters.sortBy === 'created_at' ? 'Date & time' : 'Date & time'}
              </TableHead>
              <TableHead className="text-xs">Customer</TableHead>
              <TableHead className="text-xs">Guests</TableHead>
              {showVenueColumn && <TableHead className="text-xs">Venue</TableHead>}
              <TableHead className="text-xs">Tables</TableHead>
              <TableHead className="text-xs">Source</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="h-10">
                  <TableCell colSpan={showVenueColumn ? 7 : 6}>
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && reservations.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={showVenueColumn ? 7 : 6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No reservations found.
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
                        Received: {formatDateYYYYMMDD(r.created_at)} {formatTimeHHMM(r.created_at)}
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
                  <span className="font-medium">{r.customers?.full_name ?? 'Walk-in'}</span>
                  {r.customers?.email && (
                    <>
                      <br />
                      <span className="text-muted-foreground">{r.customers.email}</span>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-xs text-center">{r.party_size}</TableCell>
                {showVenueColumn && (
                  <TableCell className="text-xs">{r.requested_venue?.name ?? '—'}</TableCell>
                )}
                <TableCell className="text-xs">
                  {(() => {
                    const tables = r.reservation_tables?.filter((rt) => !rt.released_at) ?? []
                    if (tables.length === 0) return <span className="text-muted-foreground">—</span>
                    return tables.map((rt) => rt.tables?.name ?? '?').join(', ')
                  })()}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {SOURCE_LABELS[r.source] ?? r.source}
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
