'use client'

import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import type { Reservation, ReservationEvent } from '@/lib/types/reservation'

export type ReservationListParams = {
  venue_id?: string
  status?: string
  source?: string
  date_from?: string
  date_to?: string
  search?: string
  sort_by?: 'created_at' | 'starts_at'
  page?: number
  page_size?: number
}

type ReservationListResponse = {
  data: Reservation[]
  count: number
  page: number
  pageSize: number
}

export function useReservations(params: ReservationListParams = {}) {
  const query = new URLSearchParams()
  if (params.venue_id) query.set('venue_id', params.venue_id)
  if (params.status) query.set('status', params.status)
  if (params.source) query.set('source', params.source)
  if (params.date_from) query.set('date_from', params.date_from)
  if (params.date_to) query.set('date_to', params.date_to)
  if (params.search) query.set('search', params.search)
  if (params.sort_by) query.set('sort_by', params.sort_by)
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))

  return useQuery({
    queryKey: qk.reservations.list(params),
    queryFn: () => apiFetch<ReservationListResponse>(`/api/reservations?${query}`),
  })
}

export function useReservation(id: string | null) {
  return useQuery({
    queryKey: qk.reservations.detail(id ?? ''),
    queryFn: () => apiFetch<{ data: Reservation }>(`/api/reservations/${id}`),
    enabled: !!id,
  })
}

export function useReservationEvents(id: string | null) {
  return useQuery({
    queryKey: qk.reservations.events(id ?? ''),
    queryFn: () => apiFetch<{ data: ReservationEvent[] }>(`/api/reservations/${id}/events`),
    enabled: !!id,
  })
}

export function useTimelineReservations(venueId: string, date: string) {
  return useQuery({
    queryKey: qk.reservations.timeline(venueId, date),
    queryFn: () =>
      apiFetch<{ data: Reservation[] }>(
        `/api/reservations/timeline?venue_id=${venueId}&date=${date}`,
      ),
    enabled: !!venueId && !!date,
    staleTime: 15_000,
  })
}
