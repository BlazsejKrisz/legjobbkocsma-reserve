'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { qk } from '@/lib/query/keys'

/**
 * Sets up a Supabase Realtime subscription on the reservations table.
 *
 * - INSERT with status=pending_manual_review  → new overflow item arrived → invalidate + toast
 * - UPDATE (any)                              → item resolved / reassigned → invalidate queue
 *
 * Requires Realtime to be enabled for the `reservations` table in your
 * Supabase project: Database → Replication → enable for public.reservations.
 */
export function useOverflowRealtime() {
  const qc = useQueryClient()
  // Track the previous count so we know when a genuinely new item arrived
  const prevCountRef = useRef<number | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('overflow-realtime')
      // New overflow item inserted
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reservations',
          filter: 'status=eq.pending_manual_review',
        },
        () => {
          qc.invalidateQueries({ queryKey: qk.overflow.all() })
          qc.invalidateQueries({ queryKey: qk.reservations.all() })
          toast.warning('New item in the overflow queue', {
            description: 'A reservation could not be auto-assigned and needs manual review.',
            duration: 8_000,
          })
        },
      )
      // Any reservation update — catches items leaving the queue (reassigned / cancelled)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reservations',
        },
        () => {
          qc.invalidateQueries({ queryKey: qk.overflow.all() })
          qc.invalidateQueries({ queryKey: qk.reservations.all() })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])
}
