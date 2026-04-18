export type OutboxStatus =
  | 'pending'
  | 'delivering'
  | 'delivered'
  | 'failed'
  | 'skipped'

export type OutboxEvent = {
  id: string
  venue_id: string
  provider: string
  event_type: string
  reservation_id: string | null
  payload: Record<string, unknown>
  status: OutboxStatus
  dedup_key: string
  attempts: number
  max_attempts: number
  last_error: string | null
  next_retry_at: string | null
  delivered_at: string | null
  created_at: string
}

export type OutboxProviderSummary = {
  provider: string
  pending: number
  delivering: number
  delivered: number
  failed: number
  skipped: number
}

