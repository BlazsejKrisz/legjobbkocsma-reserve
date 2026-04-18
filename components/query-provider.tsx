"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import * as React from "react"
import { getQueryClient } from "@/lib/query/queryClient"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // IMPORTANT: keep the same client instance for the whole browser session.
  // Your getQueryClient() already does singleton; useState avoids recreate in strict-ish scenarios.
  const [client] = React.useState(() => getQueryClient())

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  )
}
