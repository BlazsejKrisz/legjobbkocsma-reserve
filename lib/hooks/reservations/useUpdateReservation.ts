'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'

type UpdatePayload = {
  id: string
  internal_notes?: string | null
  special_requests?: string | null
  status?: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  cancel_note?: string
  // full field edit
  customer_full_name?: string
  customer_phone?: string | null
  customer_email?: string | null
  party_size?: number
  starts_at?: string
  ends_at?: string
}

export function useUpdateReservation() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: UpdatePayload) =>
      apiFetch<{ success: boolean }>(`/api/reservations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (_, vars) => {
      toast.success('Reservation updated')
      qc.invalidateQueries({ queryKey: qk.reservations.all() })
      qc.invalidateQueries({ queryKey: qk.reservations.detail(vars.id) })
      qc.invalidateQueries({ queryKey: qk.overflow.all() })
    },
    onError: (err) => {
      toast.error('Failed to update', { description: err.message })
    },
  })
}

export function useRevertCancellation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reservationId: string) =>
      apiFetch<{ success: boolean }>(
        `/api/reservations/${reservationId}?action=revert_cancellation`,
        { method: 'POST' },
      ),
    onSuccess: (_, id) => {
      toast.success('Reservation restored to confirmed')
      qc.invalidateQueries({ queryKey: qk.reservations.all() })
      qc.invalidateQueries({ queryKey: qk.reservations.detail(id) })
      qc.invalidateQueries({ queryKey: qk.overflow.all() })
    },
    onError: (err) => {
      toast.error('Failed to restore reservation', { description: err.message })
    },
  })
}

export function useMarkConfirmationEmailSent() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (reservationId: string) =>
      apiFetch<{ success: boolean }>(
        `/api/reservations/${reservationId}?action=confirm_email`,
        { method: 'POST' },
      ),
    onSuccess: (_, id) => {
      toast.success('Confirmation marked as sent')
      qc.invalidateQueries({ queryKey: qk.reservations.detail(id) })
      qc.invalidateQueries({ queryKey: qk.overflow.all() })
    },
    onError: (err) => {
      toast.error('Failed', { description: err.message })
    },
  })
}
