'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import type { VenueGroup } from '@/lib/types/venueGroup'

export function useVenueGroups() {
  return useQuery({
    queryKey: qk.venueGroups.list(),
    queryFn: () => apiFetch<{ data: VenueGroup[] }>('/api/venue-groups'),
  })
}

export function useVenueGroup(groupId: string | null) {
  return useQuery({
    queryKey: qk.venueGroups.detail(groupId ?? ''),
    queryFn: () => apiFetch<{ data: VenueGroup }>(`/api/venue-groups/${groupId}`),
    enabled: !!groupId,
  })
}

export function useCreateVenueGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ data: VenueGroup }>('/api/venue-groups', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      toast.success('Group created')
      qc.invalidateQueries({ queryKey: qk.venueGroups.list() })
    },
    onError: (e) => toast.error('Failed to create group', { description: e.message }),
  })
}

export function useUpdateVenueGroup(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ data: VenueGroup }>(`/api/venue-groups/${groupId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      toast.success('Group updated')
      qc.invalidateQueries({ queryKey: qk.venueGroups.list() })
      qc.invalidateQueries({ queryKey: qk.venueGroups.detail(groupId) })
    },
    onError: (e) => toast.error('Failed to update group', { description: e.message }),
  })
}

export function useDeleteVenueGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) =>
      apiFetch(`/api/venue-groups/${groupId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Group deleted')
      qc.invalidateQueries({ queryKey: qk.venueGroups.list() })
    },
    onError: (e) => toast.error('Failed to delete group', { description: e.message }),
  })
}

export function useAddGroupMember(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (venueId: number) =>
      apiFetch(`/api/venue-groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ venue_id: venueId }),
      }),
    onSuccess: () => {
      toast.success('Venue added to group')
      qc.invalidateQueries({ queryKey: qk.venueGroups.detail(groupId) })
      qc.invalidateQueries({ queryKey: qk.venueGroups.list() })
    },
    onError: (e) => toast.error('Failed to add venue', { description: e.message }),
  })
}

export function useRemoveGroupMember(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (venueId: string) =>
      apiFetch(`/api/venue-groups/${groupId}/members/${venueId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Venue removed from group')
      qc.invalidateQueries({ queryKey: qk.venueGroups.detail(groupId) })
      qc.invalidateQueries({ queryKey: qk.venueGroups.list() })
    },
    onError: (e) => toast.error('Failed to remove venue', { description: e.message }),
  })
}

export function useReorderGroupMembers(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedVenueIds: number[]) =>
      apiFetch(`/api/venue-groups/${groupId}/reorder`, {
        method: 'POST',
        body: JSON.stringify({ ordered_venue_ids: orderedVenueIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.venueGroups.detail(groupId) })
      qc.invalidateQueries({ queryKey: qk.venueGroups.list() })
    },
    onError: (e) => toast.error('Failed to reorder', { description: e.message }),
  })
}
