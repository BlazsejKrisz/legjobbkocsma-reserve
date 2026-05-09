import { revalidateTag } from 'next/cache'
import { tags } from './cacheTags'

// Centralized cache-invalidation API.  Mutation route handlers call
// `invalidate.venues()`, `invalidate.venue(id)`, etc., instead of
// hand-spelling tag strings.  Keeps the tag namespace consistent and
// makes it easy to grep for "what invalidates the venue cache".
//
// Next 16 `revalidateTag(tag, profile)` requires a CacheLife profile
// (string like 'minutes' or 'hours' or a custom CacheLifeConfig) so
// the runtime knows the staleness semantics of the tag it's purging.
// We pass the same profile each cached fetcher used (see lib/data/*.ts).
//
// Note on context: revalidateTag is the right tool for route handlers
// (POST/PATCH/DELETE).  `updateTag` exists too but only works inside
// Server Actions (read-your-own-writes); we don't use server actions
// for these mutations.

const VENUES_PROFILE = 'minutes'
const TABLES_PROFILE = 'minutes'
const TABLE_TYPES_PROFILE = 'hours'

export const invalidate = {
  venues() {
    revalidateTag(tags.venues.all(), VENUES_PROFILE)
  },
  venue(id: string | number) {
    revalidateTag(tags.venues.all(), VENUES_PROFILE)
    revalidateTag(tags.venues.one(id), VENUES_PROFILE)
  },
  venueSettings(id: string | number) {
    revalidateTag(tags.venues.settings(id), VENUES_PROFILE)
  },
  venueOpenHours(id: string | number) {
    revalidateTag(tags.venues.openHours(id), VENUES_PROFILE)
  },
  venueIntegrations(id: string | number) {
    revalidateTag(tags.venues.integrations(id), VENUES_PROFILE)
  },
  venueTables(venueId: string | number) {
    revalidateTag(tags.tables.byVenue(venueId), TABLES_PROFILE)
  },
  tableTypes() {
    revalidateTag(tags.tableTypes.all(), TABLE_TYPES_PROFILE)
  },
}
