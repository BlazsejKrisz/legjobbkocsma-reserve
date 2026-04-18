'use client'

import { useState } from 'react'
import { RefreshCw, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useOutboxSummary, useFailedOutboxEvents, useRetryOutboxEvent } from '@/lib/hooks/venues/useVenues'
import type { OutboxProviderSummary, OutboxEvent } from '@/lib/types/outbox'

type Props = {
  venueId: string
}

// ─── Status colour helpers ────────────────────────────────────────────────────

const COUNT_CLASSES: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  delivering: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  delivered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  failed: 'bg-red-500/10 text-red-400 border-red-500/25',
  skipped: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/25',
}

function CountBadge({ label, count }: { label: string; count: number }) {
  if (count === 0 && label === 'failed') return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums ${COUNT_CLASSES[label] ?? 'bg-zinc-500/10 text-zinc-400'}`}
    >
      {count} {label}
    </span>
  )
}

// ─── Failed-events drill-down ─────────────────────────────────────────────────

function FailedEventRow({
  event,
  venueId,
}: {
  event: OutboxEvent
  venueId: string
}) {
  const [showPayload, setShowPayload] = useState(false)
  const retry = useRetryOutboxEvent(venueId)

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 flex flex-col gap-2">
      {/* Header row */}
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium font-mono">
              {event.event_type.replace(/_/g, ' ')}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {new Date(event.created_at).toLocaleString()}
            </span>
            <Badge className="bg-red-500/10 text-red-400 border-red-500/25 text-[10px]">
              {event.attempts}/{event.max_attempts} attempts
            </Badge>
          </div>

          {event.last_error && (
            <p className="mt-1 text-[11px] text-red-400 line-clamp-2">{event.last_error}</p>
          )}

          {event.next_retry_at && (
            <p className="text-[10px] text-muted-foreground">
              Next retry: {new Date(event.next_retry_at).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => setShowPayload((v) => !v)}
          >
            {showPayload ? 'Hide' : 'Payload'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2"
            disabled={retry.isPending}
            onClick={() => retry.mutate(event.id)}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      </div>

      {/* Payload */}
      {showPayload && (
        <pre className="text-[10px] text-muted-foreground overflow-x-auto rounded bg-muted/30 p-2 max-h-48">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ProviderFailedEvents({
  venueId,
  provider,
}: {
  venueId: string
  provider: string
}) {
  const { data, isLoading, refetch } = useFailedOutboxEvents(venueId, provider)
  const events: OutboxEvent[] = data?.data ?? []

  if (isLoading) {
    return <p className="text-xs text-muted-foreground py-2">Loading failed events…</p>
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">
        No failed events — all clear.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
          Failed events ({events.length})
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-[10px] px-2"
          onClick={() => refetch()}
        >
          Refresh
        </Button>
      </div>
      {events.map((ev) => (
        <FailedEventRow key={ev.id} event={ev} venueId={venueId} />
      ))}
    </div>
  )
}

// ─── Provider card ────────────────────────────────────────────────────────────

function ProviderCard({
  summary,
  venueId,
}: {
  summary: OutboxProviderSummary
  venueId: string
}) {
  const [open, setOpen] = useState(summary.failed > 0)
  const hasFailed = summary.failed > 0

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border bg-card">
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 rounded-md">
            {/* Provider name */}
            <span className="text-sm font-medium capitalize flex-1">{summary.provider}</span>

            {/* Count badges */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <CountBadge label="pending" count={summary.pending} />
              <CountBadge label="delivering" count={summary.delivering} />
              <CountBadge label="delivered" count={summary.delivered} />
              {summary.failed > 0 && <CountBadge label="failed" count={summary.failed} />}
              <CountBadge label="skipped" count={summary.skipped} />
            </div>

            {/* Chevron */}
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 border-t border-border">
            {hasFailed ? (
              <div className="pt-3">
                <ProviderFailedEvents venueId={venueId} provider={summary.provider} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic pt-3">
                No failed events for this provider.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OutboxDashboard({ venueId }: Props) {
  const { data, isLoading, refetch, dataUpdatedAt } = useOutboxSummary(venueId)
  const summaries: OutboxProviderSummary[] = data?.data ?? []

  const totalFailed = summaries.reduce((acc, s) => acc + s.failed, 0)
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <h2 className="text-sm font-medium">Outbox delivery status</h2>
          {lastUpdated && (
            <p className="text-[10px] text-muted-foreground">Updated {lastUpdated}</p>
          )}
        </div>

        {totalFailed > 0 && (
          <div className="flex items-center gap-1.5 text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs font-medium">{totalFailed} failed</span>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={isLoading}
          onClick={() => refetch()}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {/* Provider cards */}
      {!isLoading && summaries.length > 0 && (
        <div className="flex flex-col gap-2">
          {summaries.map((s) => (
            <ProviderCard key={s.provider} summary={s} venueId={venueId} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && summaries.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No outbox activity yet. Events will appear here once integrations are configured and
          reservations are created.
        </p>
      )}
    </div>
  )
}
