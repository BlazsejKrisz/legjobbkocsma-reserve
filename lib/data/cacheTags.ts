// Centralized cache-tag registry.  Every `'use cache'` data fetcher
// associates rows it reads with one of these tags via `cacheTag(...)`.
// Mutation route handlers call `revalidateTag(...)` to invalidate the
// specific slice they affected.
//
// Keep tags fine-grained enough that a venue mutation doesn't blow
// away unrelated table-type / user / customer caches, but not so
// fine-grained that you forget which one to invalidate.
export const tags = {
  venues: {
    all: () => 'venues' as const,
    one: (id: string | number) => `venue:${id}` as const,
    openHours: (id: string | number) => `venue:${id}:open-hours` as const,
    settings: (id: string | number) => `venue:${id}:settings` as const,
    integrations: (id: string | number) => `venue:${id}:integrations` as const,
  },
  tables: {
    byVenue: (venueId: string | number) => `venue:${venueId}:tables` as const,
  },
  tableTypes: {
    all: () => 'table-types' as const,
  },
  users: {
    all: () => 'users' as const,
  },
} as const
