// lib/query/queryClient.ts
"use client"

import { QueryClient } from "@tanstack/react-query"

let client: QueryClient | null = null

export function getQueryClient() {
  if (client) return client

  client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 10_000,
      },
      mutations: {
        retry: 0,
      },
    },
  })

  return client
}
