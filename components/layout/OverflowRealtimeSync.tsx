'use client'

import { useOverflowRealtime } from '@/lib/hooks/overflow/useOverflowRealtime'

/**
 * Mounts the Supabase Realtime subscription for the overflow queue.
 * Renders nothing — exists only to activate the subscription inside
 * the client component tree.
 */
export function OverflowRealtimeSync() {
  useOverflowRealtime()
  return null
}
