export const qk = {
  venueGroups: {
    all: () => ['venueGroups'] as const,
    list: () => ['venueGroups', 'list'] as const,
    detail: (id: string) => ['venueGroups', id] as const,
  },
  reservations: {
    all: () => ['reservations'] as const,
    list: (params: Record<string, unknown>) => ['reservations', 'list', params] as const,
    detail: (id: string) => ['reservations', id] as const,
    events: (id: string) => ['reservations', id, 'events'] as const,
    timeline: (venueId: string, date: string) => ['reservations', 'timeline', venueId, date] as const,
  },
  overflow: {
    all: () => ['overflow'] as const,
    list: (venueId?: string) => ['overflow', 'list', venueId ?? 'all'] as const,
    reallocation: (reservationId: string) => ['overflow', 'reallocation', reservationId] as const,
  },
  venues: {
    all: () => ['venues'] as const,
    list: () => ['venues', 'list'] as const,
    detail: (id: string) => ['venues', id] as const,
    settings: (id: string) => ['venues', id, 'settings'] as const,
    openHours: (id: string) => ['venues', id, 'open-hours'] as const,
    integrations: (id: string) => ['venues', id, 'integrations'] as const,
    outboxSummary: (id: string) => ['venues', id, 'outbox', 'summary'] as const,
    outboxFailed: (id: string, provider: string) => ['venues', id, 'outbox', 'failed', provider] as const,
  },
  tables: {
    all: () => ['tables'] as const,
    byVenue: (venueId: string) => ['tables', 'venue', venueId] as const,
    detail: (id: string) => ['tables', id] as const,
    types: (venueId: string) => ['tables', 'types', venueId] as const,
    available: (venueId: string, startsAt: string, endsAt: string) =>
      ['tables', 'available', venueId, startsAt, endsAt] as const,
  },
  users: {
    all: () => ['users'] as const,
    list: () => ['users', 'list'] as const,
    detail: (id: string) => ['users', id] as const,
  },
  dashboard: {
    overview: () => ['dashboard', 'overview'] as const,
  },
}
