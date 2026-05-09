'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import { useUpdateVenueOrigins } from '@/lib/hooks/venues/useVenues'
import { useT } from '@/lib/i18n/useT'

type VenueWithOrigins = { id: string; allowed_origins: string[] }

export function AllowedOriginsEditor({ venueId }: { venueId: string }) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const { data } = useQuery({
    queryKey: qk.venues.detail(venueId),
    queryFn: () => apiFetch<{ data: VenueWithOrigins }>(`/api/venues/${venueId}`),
  })

  const origins: string[] = data?.data?.allowed_origins ?? []
  const update = useUpdateVenueOrigins(venueId)

  function isValidOrigin(v: string): boolean {
    try {
      const url = new URL(v)
      return url.origin === v && (url.protocol === 'https:' || url.protocol === 'http:')
    } catch {
      return false
    }
  }

  function add() {
    const trimmed = draft.trim().replace(/\/$/, '')
    if (!isValidOrigin(trimmed)) {
      setError(t.allowed_origins.error_invalid)
      return
    }
    if (origins.includes(trimmed)) {
      setError(t.allowed_origins.error_duplicate)
      return
    }
    setError('')
    update.mutate([...origins, trimmed], {
      onSuccess: () => setDraft(''),
    })
  }

  function remove(origin: string) {
    update.mutate(origins.filter((o) => o !== origin))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t.allowed_origins.title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t.allowed_origins.description}{' '}
          <code className="text-[11px] bg-muted px-1 py-0.5 rounded">https://example.com</code>
        </p>
      </div>

      {origins.length > 0 ? (
        <ul className="space-y-1.5">
          {origins.map((origin) => (
            <li key={origin} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <code className="text-xs font-mono text-foreground">{origin}</code>
              <button
                onClick={() => remove(origin)}
                disabled={update.isPending}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label={`Remove ${origin}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground/60 italic">
          {t.allowed_origins.empty_state}
        </p>
      )}

      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder={t.allowed_origins.input_placeholder}
            className="h-8 text-sm font-mono"
          />
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={add} disabled={update.isPending || !draft.trim()} className="shrink-0">
          <Plus />
          {t.allowed_origins.add}
        </Button>
      </div>
    </div>
  )
}
