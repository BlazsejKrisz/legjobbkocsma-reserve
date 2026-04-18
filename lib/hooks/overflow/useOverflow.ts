'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import type { Reservation, ReallocationOption } from '@/lib/types/reservation'
import type { ReassignReservationPayload } from '@/lib/validators/reservations'

export function useOverflowQueue(venueId?: string) {
  const params = venueId ? `?venue_id=${venueId}` : ''
  return useQuery({
    queryKey: qk.overflow.list(venueId),
    queryFn: () => apiFetch<{ data: Reservation[] }>(`/api/overflow${params}`),
    refetchInterval: 30_000,
  })
}

export function useReallocationOptions(reservationId: string | null) {
  return useQuery({
    queryKey: qk.overflow.reallocation(reservationId ?? ''),
    queryFn: () =>
      apiFetch<{ data: ReallocationOption[] }>(
        `/api/overflow/${reservationId}/reassign`,
      ),
    enabled: !!reservationId,
  })
}

export function useReassignReservation() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({
      reservationId,
      ...payload
    }: ReassignReservationPayload & { reservationId: string }) =>
      apiFetch<{ data: unknown }>(`/api/overflow/${reservationId}/reassign`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Reservation reassigned')
      qc.invalidateQueries({ queryKey: qk.overflow.all() })
      qc.invalidateQueries({ queryKey: qk.reservations.all() })
      qc.invalidateQueries({ queryKey: qk.dashboard.overview() })
    },
    onError: (err) => {
      toast.error('Reassignment failed', { description: err.message })
    },
  })
}
