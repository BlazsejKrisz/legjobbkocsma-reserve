'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import type { Venue, VenueSettings, VenueOpenHours, VenueIntegration } from '@/lib/types/venue'
import type { OutboxProviderSummary, OutboxEvent } from '@/lib/types/outbox'
import type {
  CreateVenuePayload,
  VenueSettingsPayload,
  UpsertOpenHoursPayload,
  UpsertIntegrationPayload,
} from '@/lib/validators/venues'

export function useVenues() {
  return useQuery({
    queryKey: qk.venues.list(),
    queryFn: () => apiFetch<{ data: Venue[] }>('/api/venues'),
  })
}

export function useVenueSettings(venueId: string) {
  return useQuery({
    queryKey: qk.venues.settings(venueId),
    queryFn: () => apiFetch<{ data: VenueSettings | null }>(`/api/venues/${venueId}/settings`),
    enabled: !!venueId,
  })
}

export function useVenueOpenHours(venueId: string) {
  return useQuery({
    queryKey: qk.venues.openHours(venueId),
    queryFn: () => apiFetch<{ data: VenueOpenHours[] }>(`/api/venues/${venueId}/open-hours`),
    enabled: !!venueId,
  })
}

export function useVenueIntegrations(venueId: string) {
  return useQuery({
    queryKey: qk.venues.integrations(venueId),
    queryFn: () =>
      apiFetch<{ data: VenueIntegration[] }>(`/api/venues/${venueId}/integrations`),
    enabled: !!venueId,
  })
}

export function useUpsertIntegration(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpsertIntegrationPayload) =>
      apiFetch<{ data: VenueIntegration }>(`/api/venues/${venueId}/integrations`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Integration saved')
      qc.invalidateQueries({ queryKey: qk.venues.integrations(venueId) })
    },
    onError: (err) => toast.error('Failed to save integration', { description: err.message }),
  })
}

export function useOutboxSummary(venueId: string) {
  return useQuery({
    queryKey: qk.venues.outboxSummary(venueId),
    queryFn: () =>
      apiFetch<{ data: OutboxProviderSummary[] }>(`/api/venues/${venueId}/outbox/summary`),
    enabled: !!venueId,
    refetchInterval: 60_000,
  })
}

export function useFailedOutboxEvents(venueId: string, provider: string) {
  return useQuery({
    queryKey: qk.venues.outboxFailed(venueId, provider),
    queryFn: () =>
      apiFetch<{ data: OutboxEvent[] }>(
        `/api/venues/${venueId}/outbox/failed?provider=${encodeURIComponent(provider)}`,
      ),
    enabled: !!venueId && !!provider,
  })
}

export function useRetryOutboxEvent(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (outboxId: string) =>
      apiFetch(`/api/venues/${venueId}/outbox/${outboxId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Retry queued')
      qc.invalidateQueries({ queryKey: qk.venues.outboxSummary(venueId) })
      // Invalidate all failed event queries for this venue
      qc.invalidateQueries({ queryKey: ['venues', venueId, 'outbox', 'failed'] })
    },
    onError: (err) => toast.error('Retry failed', { description: err.message }),
  })
}

export function useCreateVenue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateVenuePayload) =>
      apiFetch<{ data: { venue_id: string } }>('/api/venues', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Venue created')
      qc.invalidateQueries({ queryKey: qk.venues.all() })
    },
    onError: (err) => toast.error('Failed to create venue', { description: err.message }),
  })
}

export function useUpdateVenueSettings(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: VenueSettingsPayload) =>
      apiFetch<{ success: boolean }>(`/api/venues/${venueId}/settings`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Settings saved')
      qc.invalidateQueries({ queryKey: qk.venues.settings(venueId) })
    },
    onError: (err) => toast.error('Failed to save settings', { description: err.message }),
  })
}

export function useUpdateOpenHours(venueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpsertOpenHoursPayload) =>
      apiFetch<{ success: boolean }>(`/api/venues/${venueId}/open-hours`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Open hours saved')
      qc.invalidateQueries({ queryKey: qk.venues.openHours(venueId) })
    },
    onError: (err) => toast.error('Failed to save open hours', { description: err.message }),
  })
}
