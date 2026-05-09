import { cookies } from 'next/headers'
import { cache } from 'react'
import { translations } from './translations'

// Per-request memoization via React's `cache()`.  Multiple RSCs in the
// same page render call `getServerT()` (layout + page + nested
// components); without this, the cookie store + index lookup runs
// once per call.  `cache()` makes them share a single result for the
// duration of one request without persisting across requests — which
// is exactly what we want for cookie-derived data.
//
// We can't use Next's `'use cache'` directive here because reading
// cookies forces dynamic rendering, and 'use cache' boundaries
// explicitly forbid request-scoped data.
export const getServerT = cache(async () => {
  const store = await cookies()
  const lang = store.get('lang')?.value === 'hu' ? 'hu' : 'en'
  return translations[lang]
})
