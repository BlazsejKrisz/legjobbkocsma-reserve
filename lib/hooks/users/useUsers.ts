'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import type { UserWithRolesAndVenues, AppRole } from '@/lib/types/user'

export function useUsers() {
  return useQuery({
    queryKey: qk.users.list(),
    queryFn: () => apiFetch<{ data: UserWithRolesAndVenues[] }>('/api/users'),
  })
}

export function useAssignRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AppRole }) =>
      apiFetch<{ success: boolean }>(`/api/users/${userId}?action=assign_role`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      toast.success('Role assigned')
      queryClient.invalidateQueries({ queryKey: qk.users.all() })
    },
    onError: (err) => {
      toast.error('Failed to assign role', { description: err.message })
    },
  })
}

export function useAssignVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, venueId }: { userId: string; venueId: string }) =>
      apiFetch<{ success: boolean }>(`/api/users/${userId}?action=assign_venue`, {
        method: 'POST',
        body: JSON.stringify({ venue_id: venueId }),
      }),
    onSuccess: () => {
      toast.success('Venue access granted')
      queryClient.invalidateQueries({ queryKey: qk.users.all() })
    },
    onError: (err) => {
      toast.error('Failed', { description: err.message })
    },
  })
}

export function useRemoveVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, venueId }: { userId: string; venueId: string }) =>
      apiFetch<{ success: boolean }>(`/api/users/${userId}?action=remove_venue`, {
        method: 'POST',
        body: JSON.stringify({ venue_id: venueId }),
      }),
    onSuccess: () => {
      toast.success('Venue access removed')
      queryClient.invalidateQueries({ queryKey: qk.users.all() })
    },
    onError: (err) => {
      toast.error('Failed', { description: err.message })
    },
  })
}
