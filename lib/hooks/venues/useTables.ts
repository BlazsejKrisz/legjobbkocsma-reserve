'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import type { Table, TableType } from '@/lib/types/table'
import type { AvailableTable } from '@/lib/types/venueGroup'
import type { UpsertTablePayload, UpsertTableTypePayload, ReorderTablesPayload } from '@/lib/validators/tables'

// ─── Table Types ─────────────────────────────────────────────────────────────

export function useTableTypes(venueId: string) {
  return useQuery({
    queryKey: qk.tables.types(venueId),
    queryFn: () =>
      apiFetch<{ data: TableType[] }>(`/api/venues/${venueId}/table-types`),
    enabled: !!venueId,
  })
}

export function useCreateTableType(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpsertTableTypePayload) =>
      apiFetch<{ data: TableType }>(`/api/venues/${venueId}/table-types`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Table type created')
      qc.invalidateQueries({ queryKey: qk.tables.types(venueId) })
    },
    onError: (e) => toast.error('Failed to create table type', { description: e.message }),
  })
}

export function useUpdateTableType(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: UpsertTableTypePayload & { id: string }) =>
      apiFetch<{ data: TableType }>(`/api/venues/${venueId}/table-types/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Table type updated')
      qc.invalidateQueries({ queryKey: qk.tables.types(venueId) })
    },
    onError: (e) => toast.error('Failed to update table type', { description: e.message }),
  })
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export function useTables(venueId: string) {
  return useQuery({
    queryKey: qk.tables.byVenue(venueId),
    queryFn: () =>
      apiFetch<{ data: Table[] }>(`/api/venues/${venueId}/tables`),
    enabled: !!venueId,
  })
}

export function useCreateTable(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpsertTablePayload) =>
      apiFetch<{ data: Table }>(`/api/venues/${venueId}/tables`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Table created')
      qc.invalidateQueries({ queryKey: qk.tables.byVenue(venueId) })
    },
    onError: (e) => toast.error('Failed to create table', { description: e.message }),
  })
}

export function useUpdateTable(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: UpsertTablePayload & { id: string }) =>
      apiFetch<{ data: Table }>(`/api/venues/${venueId}/tables/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Table updated')
      qc.invalidateQueries({ queryKey: qk.tables.byVenue(venueId) })
    },
    onError: (e) => toast.error('Failed to update table', { description: e.message }),
  })
}

export function useDeactivateTable(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tableId: string) =>
      apiFetch(`/api/venues/${venueId}/tables/${tableId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }),
    onSuccess: () => {
      toast.success('Table deactivated')
      qc.invalidateQueries({ queryKey: qk.tables.byVenue(venueId) })
    },
    onError: (e) => toast.error('Failed to deactivate table', { description: e.message }),
  })
}

export function useAvailableTables(venueId: string, startsAt: string, endsAt: string) {
  return useQuery({
    queryKey: qk.tables.available(venueId, startsAt, endsAt),
    queryFn: () =>
      apiFetch<{ data: AvailableTable[] }>(
        `/api/venues/${venueId}/available-tables?starts_at=${encodeURIComponent(startsAt)}&ends_at=${encodeURIComponent(endsAt)}`,
      ),
    enabled: !!venueId && !!startsAt && !!endsAt,
  })
}

export function useReorderTables(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ReorderTablesPayload) =>
      apiFetch(`/api/venues/${venueId}/tables/reorder`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tables.byVenue(venueId) })
    },
    onError: (e) => toast.error('Failed to reorder tables', { description: e.message }),
  })
}
