'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import type {
  CheckAvailabilityPayload,
  CreateFromAvailabilityPayload,
} from '@/lib/validators/availability'

export type AvailabilityRow = {
  match_type: 'requested' | 'alt_time' | 'alt_venue'
  ord: number
  venue_id: number
  venue_name: string
  starts_at: string
  ends_at: string
  table_ids: number[]
  combined: boolean
  capacity_min: number
  capacity_max: number
}

export function useCheckAvailability() {
  return useMutation({
    mutationFn: (payload: CheckAvailabilityPayload) =>
      apiFetch<{ data: AvailabilityRow[] }>('/api/availability/check', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  })
}

export function useCreateFromAvailability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateFromAvailabilityPayload) =>
      apiFetch<{
        data: {
          reservation_id: number
          status: string
          assigned_venue_id: number
        }
      }>('/api/reservations/from-availability', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Reservation confirmed')
      qc.invalidateQueries({ queryKey: qk.reservations.all() })
      qc.invalidateQueries({ queryKey: qk.dashboard.overview() })
    },
    onError: (err: Error) => {
      toast.error('Failed to confirm reservation', { description: err.message })
    },
  })
}
