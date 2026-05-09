'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'

export type CustomerListItem = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  created_at: string
  total_reservations: number
  last_reservation_at: string | null
  total_guests: number
}

type Params = {
  search?: string
  page: number
  pageSize: number
}

type Response = {
  data: CustomerListItem[]
  count: number
  page: number
  pageSize: number
}

// Customer list hook.  Uses TanStack `keepPreviousData` so the table
// doesn't skeletonise on every search keystroke or page change —
// the previous data sticks around until the new fetch lands, which
// matches how Linear/Stripe paginate.
export function useCustomers(params: Params) {
  const search = params.search?.trim() ?? ''
  const qs = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize),
  })
  if (search) qs.set('search', search)

  return useQuery({
    queryKey: qk.customers.list({ search, page: params.page, pageSize: params.pageSize }),
    queryFn: () => apiFetch<Response>(`/api/customers?${qs.toString()}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
