'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import type { Reservation } from '@/lib/types/reservation'

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

// Optimistic update for status changes — particularly cancel: the row
// fades / disappears immediately on click, before the server confirms.
// On error we restore the previous cache so the row reappears.  Same
// pattern as Linear/Vercel: action feels instant, network failures
// surface via toast.
export function useUpdateReservation() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: UpdatePayload) =>
      apiFetch<{ success: boolean }>(`/api/reservations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    // Snapshot the affected query caches before applying the optimistic
    // change so onError can roll back exactly what we touched.
    onMutate: async (vars) => {
      // Cancel inflight queries first so they don't overwrite our
      // optimistic update on settle.
      await qc.cancelQueries({ queryKey: qk.overflow.all() })
      await qc.cancelQueries({ queryKey: qk.reservations.all() })

      const overflowSnapshots = qc.getQueriesData<{ data: Reservation[] }>({
        queryKey: qk.overflow.all(),
      })

      // Cancel-flow optimistic: remove the row from every overflow list
      // we have cached so the queue updates instantly.
      if (vars.status === 'cancelled') {
        for (const [key] of overflowSnapshots) {
          qc.setQueryData<{ data: Reservation[] }>(key, (old) => {
            if (!old) return old
            return { ...old, data: old.data.filter((r) => r.id !== vars.id) }
          })
        }
      }

      return { overflowSnapshots }
    },
    onError: (err, _vars, ctx) => {
      // Roll back every overflow snapshot we patched.
      if (ctx?.overflowSnapshots) {
        for (const [key, snapshot] of ctx.overflowSnapshots) {
          qc.setQueryData(key, snapshot)
        }
      }
      toast.error('Failed to update', { description: err.message })
    },
    onSuccess: (_, vars) => {
      toast.success('Reservation updated')
      qc.invalidateQueries({ queryKey: qk.reservations.all() })
      qc.invalidateQueries({ queryKey: qk.reservations.detail(vars.id) })
      qc.invalidateQueries({ queryKey: qk.overflow.all() })
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

export function useChangeTables() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reservationId, new_table_ids }: { reservationId: string; new_table_ids: number[] }) =>
      apiFetch<{ success: boolean }>(
        `/api/reservations/${reservationId}?action=change_tables`,
        { method: 'POST', body: JSON.stringify({ new_table_ids }) },
      ),
    onSuccess: (_, vars) => {
      toast.success('Tables updated')
      qc.invalidateQueries({ queryKey: qk.reservations.detail(vars.reservationId) })
      qc.invalidateQueries({ queryKey: qk.reservations.all() })
    },
    onError: (err) => {
      toast.error('Failed to change tables', { description: err.message })
    },
  })
}

// Demote a reservation to the overflow queue.  Used by the edit modal when
// the new criteria (date/time/party) don't fit any available tables.
export function useMoveToOverflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      reservationId,
      ...payload
    }: {
      reservationId: string
      starts_at?: string
      ends_at?: string
      party_size?: number
      customer_full_name?: string
      customer_phone?: string | null
      customer_email?: string | null
      special_requests?: string | null
      internal_notes?: string | null
    }) =>
      apiFetch<{ success: boolean }>(
        `/api/reservations/${reservationId}?action=to_overflow`,
        { method: 'POST', body: JSON.stringify(payload) },
      ),
    onSuccess: (_, vars) => {
      toast.success('Reservation moved to overflow queue')
      qc.invalidateQueries({ queryKey: qk.reservations.detail(vars.reservationId) })
      qc.invalidateQueries({ queryKey: qk.reservations.all() })
      qc.invalidateQueries({ queryKey: qk.overflow.all() })
    },
    onError: (err) => {
      toast.error('Failed to move to overflow', { description: err.message })
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
