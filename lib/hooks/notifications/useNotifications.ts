'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'

export type NotificationRow = {
  id: number
  reservation_id: number | null
  channel: 'email' | 'sms'
  kind: 'confirmation' | 'received' | 'updated' | 'reminder' | 'cancellation'
  to_address: string
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'dead'
  attempts: number
  provider_id: string | null
  last_error: string | null
  next_attempt_at: string
  created_at: string
  sent_at: string | null
  reservation?: {
    id: number
    starts_at: string
    requested_venue?: { id: number; name: string } | null
    assigned_venue?: { id: number; name: string } | null
  } | null
}

export type NotificationFilters = {
  status?: string
  channel?: string
  kind?: string
  search?: string
  venue_id?: string
  page?: number
  page_size?: number
}

export type NotificationStats = {
  sent: number
  failed: number
  dead: number
  pending: number
  sending: number
}

export function useNotifications(filters: NotificationFilters) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()

  return useQuery({
    queryKey: qk.notifications.list(filters as Record<string, unknown>),
    queryFn: () =>
      apiFetch<{ data: NotificationRow[]; count: number; page: number; pageSize: number }>(
        `/api/notifications${qs ? `?${qs}` : ''}`,
      ),
    refetchInterval: 30_000, // outbox state changes async — keep it fresh
  })
}

export function useNotificationStats() {
  return useQuery({
    queryKey: qk.notifications.stats(),
    queryFn: () =>
      apiFetch<{ data: NotificationStats }>('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ op: 'stats' }),
      }),
    refetchInterval: 60_000,
  })
}

export function useRetryNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ retried: boolean }>(`/api/notifications/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Retry queued')
      qc.invalidateQueries({ queryKey: qk.notifications.all() })
    },
    onError: (err: Error) => toast.error('Retry failed', { description: err.message }),
  })
}
