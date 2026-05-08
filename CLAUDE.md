# Legjobbkocsma — Claude Code Context

**Legjobbkocsma** is a multi-venue reservation management system for hospitality operations. It provides staff dashboards for managing reservations, an overflow queue for manual intervention, customer profiles, statistics, and a public-facing API for external booking integrations.

---

## Project Overview

- **Purpose:** Internal + public reservation operations platform for venues
- **Architecture:** Next.js 16 (App Router) + TypeScript + Supabase (PostgreSQL) + React Query
- **Deployment:** Vercel + Supabase (managed)
- **Key features:** Auto-assignment of tables via PL/pgSQL, overflow queue with reassignment tool, customer profiles, multi-venue groups with fallback routing, public API with honeypot/rate-limiting/CORS, cron jobs for completion/outbox retry

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth (cookie-based SSR via `@supabase/ssr`) |
| UI Components | shadcn/ui + Radix UI |
| Styling | Tailwind CSS 3 + CVA for variants |
| Data Fetching | TanStack React Query v5 |
| Forms | React Hook Form + Zod v4 |
| State | Client context (LangProvider) |
| Email | Resend |
| Charts | Recharts |
| Icons | Lucide React |
| Canvas/Drawing | Konva + react-konva (table visualization) |
| Rate Limiting | Upstash Redis + @upstash/ratelimit (public API) |
| Theme | next-themes (dark mode) |
| Notifications | Sonner (toast) |

---

## Key Architecture Decisions

### 1. App Router with Server Components
- Pages are RSCs by default — data fetches happen server-side at build/request time, no initial client roundtrip.
- Interactive features (filters, dialogs, mutations) are isolated in client components and backed by TanStack Query.
- This keeps the bundle small and avoids "waterfall" requests on page load.

### 2. Business Logic in PostgreSQL RPC Functions
- **All** complex operations (auto-assignment, overflow routing, customer upsert, reassignment) are PL/pgSQL functions.
- This ensures atomicity, prevents race conditions, and makes logic testable/debuggable in the SQL layer.
- The backend is mostly "dumb" — it parses input, calls RPCs, and returns responses.

### 3. Role-Based Access Control (RBAC)
- Three roles: `super_admin`, `support`, `venue_staff`.
- Checked at two layers:
  1. **Page level** — RSC redirects unauthorized roles in `getSession()`.
  2. **API level** — Route handlers use `requireAuth()`, `requireSuperAdmin()`, `requireVenueAccess()` helpers.
- `venue_staff` can only see their assigned venues (filtered server-side and at the DB RLS layer).

### 4. Row-Level Security (RLS) + Service Role Bypass
- All `public` tables have RLS policies wired to auth helpers (`has_role`, `can_access_venue`).
- `createClient()` uses the publishable key → RLS is enforced.
- `createAdminClient()` uses the service role key → bypasses RLS (used for server-side operations, admin RPCs, cron jobs).
- **Never expose the service role key to the browser.**

### 5. Session Model
- Supabase Auth (cookie-based via `@supabase/ssr`).
- `getSession()` calls `supabase.auth.getClaims()` to extract the user's UUID.
- Role and venue assignments are fetched from `user_roles` and `venue_user_assignments` tables (not stored in JWT claims).
- Session info is **not cached** — every server component call re-fetches it. This ensures role changes are live.

### 6. Internationalization (i18n)
- Two languages: `en` (English), `hu` (Hungarian).
- `LangProvider` wraps the app; `useLang()` hook on the client side reads/writes a cookie.
- On language switch: `router.refresh()` re-renders RSCs with the new language from cookies.
- Server-side: `getServerT()` reads the `lang` cookie and returns `translations[lang]`.
- **No server-side redirect on language change** — just cookie update + client refresh.

### 7. Cron Jobs via Vercel Crons
- `vercel.json` defines two cron routes:
  1. `/api/cron/complete-reservations` — hourly — marks reservations as `completed` based on business rules.
  2. `/api/cron/outbox` — every 5 minutes — retries failed outgoing messages (e.g. emails, webhooks).
- Both use `GET` handlers with `Authorization: Bearer <CRON_SECRET>` verification.
- **Cron handlers are not protected by auth middleware** — they bypass the session check via route-specific logic.

---

## Authentication & Authorization

### Session Model

```typescript
// lib/auth/getSession.ts
export type UserSession = {
  userId: string
  role: AppRole  // 'super_admin' | 'support' | 'venue_staff'
  venueIds: string[]  // non-empty only for venue_staff
  isSuperAdmin: boolean
  isSupport: boolean
  isVenueStaff: boolean
}
```

**How it works:**
1. User logs in via Supabase Auth.
2. On each request, `getSession()` calls `getClaims()` to get the user's UUID.
3. Look up the user's role(s) in the `user_roles` table.
4. If `venue_staff`, fetch their assigned venue IDs from `venue_user_assignments`.
5. Return the session object.

**Role priority** (if a user has multiple roles):
- `super_admin` > `support` > `venue_staff`
- The highest role wins; all others are ignored.

### Authorization Helpers

All in `lib/api/authz.ts`:

```typescript
// Returns { ok: true, session } or { ok: false, response: <401> }
await requireAuth()

// Returns { ok: true, session } or { ok: false, response: <403> }
await requireSuperAdmin()

// Returns { ok: true, session } or { ok: false, response: <403> }
// Rejects venue_staff
await requireSupportOrAbove()

// Returns { ok: true, session } or { ok: false, response: <403> }
// Checks if session can access the given venue
await requireVenueAccess(venueId)
```

### Public API Security

The public API (`/api/public/*`) is unauthenticated but has multiple security layers:

1. **API Key Gate** — If `BOOKING_API_KEY` env var is set, all requests must include the `X-Api-Key` header. This is for server-to-server integrations (e.g. WordPress).
2. **Honeypot Field** — Public forms include a hidden honeypot field. If filled, the request is rejected.
3. **Rate Limiting** — Via Upstash Redis. Configured per-endpoint with burst allowance.
4. **CORS Whitelist** — Per-venue `partner_api_keys` allow origins. Each venue can restrict which domains can POST to its API.
5. **Input Validation** — All payloads are Zod-validated. Party size is capped at 500. Window length is capped at 18 hours.
6. **Date Validation** — Bookings cannot be in the past or beyond `max_advance_days`.

---

## Database

### Clients

**lib/supabase/server.ts:**

```typescript
// RLS-enabled client. Use this for user-initiated queries.
const supabase = await createClient()

// Service role client. Bypasses RLS. Use this for admin operations, cron jobs, server-side RPCs.
const admin = createAdminClient()
```

**Important:** Don't cache these clients in global variables if using Vercel's Fluid Compute. Always instantiate them within the function.

### Row-Level Security (RLS)

- **All public tables** have RLS enabled.
- Policies check `auth.uid()` and then query the `user_roles` / `venue_user_assignments` tables.
- Policies use helper functions defined in the schema:
  - `has_role(user_id, role)` — checks if user has a role.
  - `can_access_venue(user_id, venue_id)` — checks if user can access a venue.
  - `is_super_admin(user_id)`, `is_support(user_id)`, etc.

Example policy (pseudo-code):
```sql
-- venue_staff can only see reservations for their assigned venues
create policy staff_can_see_own_reservations
on reservations for select
using (
  is_super_admin(auth.uid())
  or is_support(auth.uid())
  or can_access_venue(auth.uid(), venue_id)
)
```

### Key Tables & RPC Functions

**Tables:**
- `auth.users` — Supabase Auth table (managed by Supabase)
- `user_roles` — `{ user_id, role }` — User role assignment
- `venue_user_assignments` — `{ user_id, venue_id }` — venue_staff venue scope
- `venues`, `tables`, `table_types` — Venue & table configuration
- `reservations`, `reservation_tables`, `reservation_events` — Reservation data & audit trail
- `customers` — Customer profiles (email, phone, preferences)
- `venue_groups` — Grouping venues for overflow fallback
- `venue_settings`, `venue_open_hours`, `venue_integrations` — Venue configuration

**Key RPCs:**
- `create_reservation_auto(venue_id, party_size, ...)` — Auto-assign tables or mark pending_manual_review.
- `get_available_tables(venue_id, ...)` — Find available single/combined tables for a time window.
- `get_reallocation_options(reservation_id, ...)` — Suggest same-time/other-time or other-venue options.
- `reassign_reservation(reservation_id, new_tables, ...)` — Move reservation to new tables/venue/time.
- `get_or_create_customer(email, phone, name)` — Customer upsert (dedup by email/phone).

---

## API Conventions

### Response Envelope

All endpoints return a consistent JSON envelope. Success and error shapes are defined in `lib/api/http.ts`:

**Success:**
```json
{ "data": { /* ... */ } }
```

**Error:**
```json
{ "error": "Human-readable message", "details": { /* optional */ } }
```

**HTTP Status Codes:**
- `200` — Success (GET, PATCH with no side-effects)
- `201` — Created (POST that creates a resource)
- `400` — Bad input (Zod validation failed)
- `401` — Unauthenticated (missing session)
- `403` — Forbidden (insufficient role or venue access)
- `404` — Not found
- `409` — Conflict (unique violation, foreign key, GiST overlap)
- `422` — Business rule violation (e.g. party size exceeds table capacity)
- `500` — Unexpected server error

### Response Helpers

**lib/api/http.ts:**

```typescript
// Return JSON with optional status code (default 200)
ok(data, { status: 201 })

// Return error JSON with optional status code (default 500)
err('Something went wrong', { status: 400 })

// Handle Supabase / PostgREST errors
// Logs if status >= 500, maps error codes to HTTP status, returns err() response
dbErr(supabaseError, 'create_reservation_auto')

// Safely parse request body JSON (returns null if parse fails)
const body = await safeJson(req)
```

### Database Error Mapping

Some Postgres errors are mapped to specific HTTP codes:

| Code | Meaning | HTTP Status |
|---|---|---|
| `PGRST116` | `.single()` returned no rows | 404 |
| `23505` | unique violation | 409 |
| `23503` | foreign key violation | 409 |
| `23P01` | GiST overlap (table exclusion constraint) | 409 |
| `42501` | insufficient_privilege (RLS reject) | 403 |

---

## i18n System

### Client Side

**lib/i18n/context.tsx:**

```typescript
export type Lang = 'en' | 'hu'

const { lang, setLang } = useLang()  // Hook in client components

const setLang = (newLang: Lang) => {
  // 1. Update cookie (1-year expiry, SameSite=Lax)
  // 2. Update state
}
```

**Usage in a client component:**

```typescript
'use client'
import { useLang } from '@/lib/i18n/context'
import { useRouter } from 'next/navigation'

export function LanguageSwitcher() {
  const { lang, setLang } = useLang()
  const router = useRouter()

  const handleSwitch = (newLang: Lang) => {
    setLang(newLang)
    router.refresh()  // Re-render RSCs with new cookie
  }

  return (
    <select value={lang} onChange={(e) => handleSwitch(e.target.value)}>
      <option value="en">English</option>
      <option value="hu">Hungarian</option>
    </select>
  )
}
```

### Server Side

**lib/i18n/serverT.ts:**

```typescript
export async function getServerT() {
  const store = await cookies()
  const lang = store.get('lang')?.value === 'hu' ? 'hu' : 'en'
  return translations[lang]
}
```

**Usage in an RSC:**

```typescript
import { getServerT } from '@/lib/i18n/serverT'

export default async function ReservationList() {
  const t = await getServerT()
  return <h1>{t.reservations.title}</h1>
}
```

### Translation File

**lib/i18n/translations.ts** (structure):

```typescript
export const translations = {
  en: { /* English labels */ },
  hu: { /* Hungarian labels */ },
}
```

---

## Data Fetching & State

### React Query Integration

**lib/query/keys.ts** — Defines all query keys:

```typescript
const qk = {
  venues: {
    all: () => ['venues'],
    list: () => ['venues', 'list'],
    detail: (id) => ['venues', id],
    settings: (id) => ['venues', id, 'settings'],
    // ...
  },
  reservations: {
    all: () => ['reservations'],
    list: (params) => ['reservations', 'list', params],
    detail: (id) => ['reservations', id],
    timeline: (venueId, date) => ['reservations', 'timeline', venueId, date],
    // ...
  },
  // etc.
}
```

**Query Hooks** — In `lib/hooks/` by domain (e.g. `lib/hooks/venues/useVenues.ts`):

```typescript
export function useVenues() {
  return useQuery({
    queryKey: qk.venues.list(),
    queryFn: async () => {
      const res = await fetch('/api/venues')
      if (!res.ok) throw new Error('Failed to fetch venues')
      return res.json().then(r => r.data)
    },
  })
}

export function useVenueDetail(id: string) {
  return useQuery({
    queryKey: qk.venues.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/venues/${id}`)
      if (!res.ok) throw new Error('Failed to fetch venue')
      return res.json().then(r => r.data)
    },
  })
}
```

**Mutations** — Typically inline in components:

```typescript
const mutation = useMutation({
  mutationFn: async (data) => {
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const errorBody = await res.json()
      throw new Error(errorBody.error)
    }
    return res.json().then(r => r.data)
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: qk.reservations.all() })
    toast.success('Reservation created')
  },
  onError: (error) => {
    toast.error(error.message)
  },
})
```

### QueryProvider

**components/query-provider.tsx:**

```typescript
'use client'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient()

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

---

## Form Validation & Handling

### Zod Validators

All API payloads are validated using Zod schemas in `lib/validators/` by domain:

**lib/validators/reservations.ts:**
```typescript
export const createReservationSchema = z.object({
  venueId: z.coerce.number().int().positive(),
  partySize: z.number().int().min(1).max(500),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  name: z.string().min(1),
})

export type CreateReservationPayload = z.infer<typeof createReservationSchema>
```

### React Hook Form

Client components use React Hook Form for interactive forms:

```typescript
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createReservationSchema } from '@/lib/validators/reservations'

export function ReservationForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createReservationSchema),
  })

  const onSubmit = async (data) => {
    // Zod has already validated `data`
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    // ...
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('partySize', { valueAsNumber: true })} />
      {errors.partySize && <span>{errors.partySize.message}</span>}
      {/* ... */}
    </form>
  )
}
```

### Route Handler Validation

In API route handlers, validate before using:

```typescript
// app/api/reservations/route.ts
import { createReservationSchema } from '@/lib/validators/reservations'

export async function POST(req: Request) {
  const auth = await requireVenueAccess(venueId)
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  if (!body) return err('Invalid JSON', { status: 400 })

  try {
    const payload = createReservationSchema.parse(body)
    // payload is now fully typed and validated
  } catch (e) {
    if (e instanceof z.ZodError) {
      return err('Validation failed', { status: 400, details: e.errors })
    }
    throw e
  }
}
```

---

## Cron Jobs

### Vercel Cron Setup

**vercel.json:**
```json
{
  "crons": [
    { "path": "/api/cron/complete-reservations", "schedule": "0 * * * *" },
    { "path": "/api/cron/outbox", "schedule": "*/5 * * * *" }
  ]
}
```

### Implementing Cron Handlers

**app/api/cron/complete-reservations/route.ts:**

```typescript
import { createAdminClient } from '@/lib/supabase/server'
import { ok, err } from '@/lib/api/http'

export async function GET(req: Request) {
  // Verify the Authorization header (Vercel sends it automatically)
  const authHeader = req.headers.get('Authorization')
  const secret = process.env.CRON_SECRET
  if (!authHeader || !secret || authHeader !== `Bearer ${secret}`) {
    return err('Unauthorized', { status: 401 })
  }

  try {
    const admin = createAdminClient()
    
    // Call the RPC that marks reservations as completed
    const { error } = await admin.rpc('mark_reservations_completed')
    if (error) return err(error.message, { status: 500 })

    return ok({ message: 'Completed' })
  } catch (e) {
    console.error('[cron/complete-reservations]', e)
    return err('Internal error', { status: 500 })
  }
}
```

**Note:** Cron handlers are **exempt from auth middleware** because they need to run unattended. Use `CRON_SECRET` to verify requests.

---

## Common Patterns

### 1. RSC Data Fetching Pattern

```typescript
// app/dashboard/reservations/page.tsx
import { getSession } from '@/lib/auth/getSession'
import { redirect } from 'next/navigation'

export default async function ReservationsPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')

  // Fetch data at render time (server-side)
  const reservations = await fetchReservations(session)

  return (
    <div>
      <h1>Reservations</h1>
      <ReservationsList data={reservations} />
    </div>
  )
}
```

### 2. Client Component with React Query

```typescript
// components/ReservationsList.tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/query/keys'

export function ReservationsList() {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.reservations.list({ status: 'confirmed' }),
    queryFn: async () => {
      const res = await fetch('/api/reservations?status=confirmed')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json().then(r => r.data)
    },
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <ul>
      {data.map((r) => (
        <li key={r.id}>{r.customer_name} — {r.party_size} guests</li>
      ))}
    </ul>
  )
}
```

### 3. API Route with Role Check

```typescript
// app/api/reservations/[id]/route.ts
import { requireVenueAccess } from '@/lib/api/authz'
import { ok, err, dbErr, safeJson } from '@/lib/api/http'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireVenueAccess(params.id)
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  if (!body) return err('Invalid JSON', { status: 400 })

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('reservations')
      .update({ status: body.status })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return dbErr(error, 'patch_reservation')
    return ok(data)
  } catch (e) {
    console.error('[PATCH /api/reservations/[id]]', e)
    return err('Internal error', { status: 500 })
  }
}
```

### 4. Mutation with Toast

```typescript
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/query/keys'

export function ReassignButton({ reservationId }: { reservationId: string }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (tableIds: string[]) => {
      const res = await fetch(`/api/overflow/${reservationId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableIds }),
      })
      if (!res.ok) {
        const errorBody = await res.json()
        throw new Error(errorBody.error)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.overflow.all() })
      toast.success('Reservation reassigned')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  return (
    <button onClick={() => mutation.mutate(['table-1', 'table-2'])} disabled={mutation.isPending}>
      {mutation.isPending ? 'Reassigning...' : 'Reassign'}
    </button>
  )
}
```

---

## File Structure

```
.
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   ├── complete-reservations/
│   │   │   │   └── route.ts
│   │   │   └── outbox/
│   │   │       └── route.ts
│   │   ├── customers/
│   │   ├── overflow/
│   │   ├── public/
│   │   │   ├── availability/
│   │   │   ├── reservations/
│   │   │   └── venues/
│   │   ├── reservations/
│   │   ├── users/
│   │   └── venues/
│   ├── auth/
│   ├── dashboard/
│   │   ├── customers/
│   │   ├── overflow/
│   │   ├── reservations/
│   │   ├── stats/
│   │   ├── users/
│   │   ├── venue-groups/
│   │   └── venues/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── customers/
│   ├── dashboard/
│   ├── layout/
│   ├── overflow/
│   ├── query-provider.tsx
│   ├── reservations/
│   ├── ui/
│   └── venues/
├── lib/
│   ├── api/
│   │   ├── authz.ts
│   │   ├── http.ts
│   │   └── publicGuard.ts
│   ├── auth/
│   │   ├── getSession.ts
│   │   └── middleware.ts
│   ├── data/
│   ├── datetime/
│   ├── domain/
│   ├── email/
│   ├── hooks/
│   │   ├── customers/
│   │   ├── overflow/
│   │   ├── reservations/
│   │   ├── venues/
│   │   └── users/
│   ├── i18n/
│   │   ├── context.tsx
│   │   ├── serverT.ts
│   │   └── translations.ts
│   ├── query/
│   │   └── keys.ts
│   ├── supabase/
│   │   ├── server.ts
│   │   └── client.ts
│   ├── types/
│   │   ├── user.ts
│   │   └── reservation.ts
│   └── validators/
│       ├── reservations.ts
│       ├── venues.ts
│       └── users.ts
├── schema/
│   ├── schema.sql
│   └── migrations/
│       ├── 001.sql
│       └── ...
├── middleware.ts
├── next.config.ts
├── vercel.json
├── tsconfig.json
├── tailwind.config.ts
└── package.json
```

---

## What NOT to Do (Gotchas)

### 1. Don't Cache Supabase Clients in Global Variables
❌ **Bad:**
```typescript
// This breaks in Vercel Fluid Compute
const supabase = createClient()

export async function fetchVenues() {
  // ...reusing the same client
}
```

✅ **Good:**
```typescript
export async function fetchVenues() {
  const supabase = await createClient()  // Fresh client each time
  // ...
}
```

### 2. Don't Trust Client-Side Role Checks
❌ **Bad:**
```typescript
// Client has no way to verify this is accurate
if (session?.isSuperAdmin) {
  // Show dangerous button
}
```

✅ **Good:**
```typescript
// Always check on the server side
const auth = await requireSuperAdmin()
if (!auth.ok) return auth.response
// Now it's safe
```

### 3. Don't Expose the Service Role Key
❌ **Bad:**
```typescript
// In a client component or bundled code
export const admin = createAdminClient()  // DO NOT EXPORT
```

✅ **Good:**
```typescript
// Only in server components and route handlers
const admin = createAdminClient()
// Keep it private
```

### 4. Don't Bypass Zod Validation
❌ **Bad:**
```typescript
const body = await req.json()  // No validation
const res = await supabase.from('reservations').insert(body)
```

✅ **Good:**
```typescript
const body = await safeJson(req)
const payload = createReservationSchema.parse(body)  // Throws if invalid
const res = await supabase.from('reservations').insert(payload)
```

### 5. Don't Forget `router.refresh()` on Language Change
❌ **Bad:**
```typescript
const setLang = (newLang) => {
  setLangCookie(newLang)
  // RSCs still use the old language
}
```

✅ **Good:**
```typescript
const setLang = (newLang) => {
  setLangCookie(newLang)
  router.refresh()  // Re-render RSCs
}
```

### 6. Don't Commit Migrations — Apply Manually
❌ **Bad:**
```bash
npm run migrate  # This command doesn't exist
```

✅ **Good:**
```
1. Open Supabase dashboard → SQL Editor
2. Copy schema/migrations/001.sql
3. Run it
4. Repeat for 001–013
```

### 7. Don't Assume RLS is Enforced on Admin Operations
❌ **Bad:**
```typescript
const admin = createAdminClient()
// RLS is BYPASSED
const { data } = await admin.from('venues').select()  // Returns ALL venues
```

✅ **Good:**
```typescript
const supabase = await createClient()
// RLS is ENFORCED
const { data } = await supabase.from('venues').select()  // Returns only accessible venues
```

### 8. Don't Use Cron Handlers for Real-Time Updates
❌ **Bad:**
```typescript
// Users expect instant feedback but it runs hourly
export async function GET(req) {
  // Complete all reservations from 1 hour ago
}
```

✅ **Good:**
```typescript
// Use for batch operations only
export async function GET(req) {
  // Complete reservations whose end_time is > 1 hour ago (safe to mark as done)
}
```

### 9. Don't Store Secrets in Code
❌ **Bad:**
```typescript
const CRON_SECRET = 'my-secret'  // Hardcoded!
```

✅ **Good:**
```typescript
const CRON_SECRET = process.env.CRON_SECRET  // From env
if (!CRON_SECRET) throw new Error('CRON_SECRET is required')
```

### 10. Don't Forget Honeypot on Public Forms
❌ **Bad:**
```html
<form>
  <input type="email" name="email" />
  <input type="submit" />
</form>
```

✅ **Good:**
```html
<form>
  <input type="email" name="email" />
  <input type="text" name="website" style="display: none" />  {/* honeypot */}
  <input type="submit" />
</form>
```

Then on submission, reject if `website` is non-empty.

---

## Environment Variables

### Required

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Optional but Recommended

```env
RESEND_API_KEY=re_...
EMAIL_FROM=Legjobbkocsma <hello@yourdomain.com>
BOOKING_API_KEY=your-secret-key
CRON_SECRET=your-long-random-secret
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## Quick Command Reference

```bash
npm install                 # Install dependencies
npm run dev                 # Start dev server
npm run build               # Build for production
npm run lint                # Run ESLint
npm start                   # Start production server
```

---

## Key Files at a Glance

| File | Purpose |
|---|---|
| `lib/auth/getSession.ts` | Load session + check roles |
| `lib/api/authz.ts` | Authorization helpers (requireAuth, requireSuperAdmin, etc.) |
| `lib/api/http.ts` | Response helpers (ok, err, dbErr) + Zod validation |
| `lib/supabase/server.ts` | Create RLS and admin Supabase clients |
| `lib/i18n/context.tsx` | Client-side language context |
| `lib/i18n/serverT.ts` | Server-side translation getter |
| `lib/query/keys.ts` | All React Query key definitions |
| `lib/validators/*.ts` | Zod schemas for API payloads |
| `vercel.json` | Cron job definitions |
| `middleware.ts` | Session refresh + auth middleware |
| `schema/schema.sql` | PostgreSQL schema (enums, tables, functions, RLS) |
| `schema/migrations/*.sql` | Numbered migration files (apply manually) |

---

## Related Documentation

- **PUBLIC_API.md** — External booking API documentation
- **README.md** — Full project overview (roles, core concepts, architecture)
- **Supabase Docs** — RLS, Auth, PostgREST
- **Next.js Docs** — App Router, middleware, server/client components
- **TanStack Query Docs** — React Query usage
- **Zod Docs** — Schema validation

