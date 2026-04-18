'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import type { CreateReservationPayload } from '@/lib/validators/reservations'

export function useCreateReservation() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateReservationPayload) =>
      apiFetch<{ data: { reservation_id: string; status: string; overflow_reason: string | null } }>(
        '/api/reservations',
        { method: 'POST', body: JSON.stringify(input) },
      ),
    onSuccess: (result) => {
      const status = result.data?.status
      if (status === 'pending_manual_review') {
        toast.warning('Reservation queued for manual review', {
          description: 'No table could be auto-assigned — it will appear in the overflow queue.',
        })
      } else {
        toast.success('Reservation confirmed')
      }
      qc.invalidateQueries({ queryKey: qk.reservations.all() })
      qc.invalidateQueries({ queryKey: qk.overflow.all() })
      qc.invalidateQueries({ queryKey: qk.dashboard.overview() })
    },
    onError: (err) => {
      toast.error('Failed to create reservation', { description: err.message })
    },
  })
}
