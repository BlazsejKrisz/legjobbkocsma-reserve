# ReserveOps

**Internal reservation management system for multi-venue hospitality operations.**

ReserveOps is a full-stack web application that handles table reservations across one or more venues. It provides a staff dashboard for managing reservations, an overflow queue for handling bookings that require manual intervention, customer profile tracking, operational statistics, and a public-facing API for external booking integrations (e.g. WordPress sites).

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Roles and Permissions](#roles-and-permissions)
- [Core Concepts](#core-concepts)
- [Dashboard Pages](#dashboard-pages)
- [Internal API](#internal-api)
- [Public Booking API](#public-booking-api)
- [Email Notifications](#email-notifications)
- [Database Migrations](#database-migrations)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Deployment](#deployment)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js App                          │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │   Dashboard  │   │  Internal    │   │   Public API   │  │
│  │  (RSC + UI)  │   │  API Routes  │   │  /api/public/* │  │
│  └──────┬───────┘   └──────┬───────┘   └───────┬────────┘  │
│         │                  │                    │           │
│         └──────────────────┴────────────────────┘           │
│                            │                                │
│                    Supabase Client (SSR)                    │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │         Supabase            │
              │                             │
              │  PostgreSQL + RLS Policies  │
              │  Auth (cookie-based SSR)    │
              │  PL/pgSQL RPC Functions     │
              └─────────────────────────────┘
```

**Request flow:**
- Dashboard pages are React Server Components — data is fetched server-side, no client roundtrip for initial load.
- Interactive UI (filters, dialogs, real-time updates) uses client components backed by `@tanstack/react-query`.
- All mutations and reads go through typed API route handlers in `app/api/`.
- The public API (`/api/public/*`) requires no authentication and is used by external booking forms.
- Business logic (table assignment, overflow routing, customer upsert) lives entirely in PostgreSQL RPC functions to keep it atomic and testable.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth — cookie-based SSR sessions |
| UI Components | shadcn/ui + Radix UI primitives |
| Styling | Tailwind CSS |
| Data fetching | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Email | Resend |
| Date utilities | date-fns |

---

## Project Structure

```
.
├── app/
│   ├── api/
│   │   ├── customers/              # Customer list + detail
│   │   ├── overflow/               # Overflow queue + reassignment
│   │   ├── public/                 # Public booking API (no auth)
│   │   │   ├── availability/       # Available slot checker
│   │   │   ├── reservations/       # External booking submission
│   │   │   └── venues/             # Public venue list
│   │   ├── reservations/           # Reservation CRUD
│   │   └── users/                  # User management
│   ├── auth/                       # Login / auth callback pages
│   └── dashboard/
│       ├── customers/              # Customer list + profile pages
│       ├── overflow/               # Manual review queue
│       ├── reservations/           # All-reservations view
│       ├── stats/                  # Statistics & charts
│       ├── users/                  # User management
│       ├── venue-groups/           # Venue group configuration
│       └── venues/
│           └── [venueId]/          # Per-venue timeline, tables, settings, etc.
├── components/
│   ├── customers/                  # CustomerList component
│   ├── dashboard/                  # OverviewStats, StatsCharts, StatsFilters
│   ├── layout/                     # Sidebar, DashboardShell, MobileNav
│   ├── overflow/                   # OverflowQueue, ReassignmentDialog
│   ├── reservations/               # ReservationsList, ReservationDetail, Filters
│   └── ui/                         # shadcn/ui primitives
├── lib/
│   ├── api/                        # http helpers, authz, publicGuard
│   ├── auth/                       # getSession, role helpers
│   ├── data/                       # Server-side data fetchers (venues, etc.)
│   ├── datetime/                   # Date/time utilities
│   ├── domain/                     # Label maps, business constants
│   ├── email/                      # Resend client, confirmation template
│   ├── hooks/                      # TanStack Query hooks by domain
│   ├── supabase/                   # Supabase client factories (server/client/proxy)
│   ├── types/                      # TypeScript domain types
│   └── validators/                 # Zod schemas for all API payloads
├── schema/
│   └── migrations/                 # Numbered SQL migration files (apply manually)
├── middleware.ts                   # Session refresh + public route passthrough
└── PUBLIC_API.md                   # External integration documentation
```

---

## Roles and Permissions

The system has three roles, assigned per-user in the `user_roles` table.

| Role | Description | Access |
|---|---|---|
| `super_admin` | Full system access | All pages, all venues, user management, venue configuration, statistics |
| `support` | Cross-venue operations | Dashboard, all reservations, overflow queue, customers, statistics. Cannot manage venues or users |
| `venue_staff` | Single-venue operations | Only sees reservations and timeline for their assigned venue(s). Cannot access overflow queue, customers, or stats |

Role checks happen at two layers:
1. **Page level** — `getSession()` in server components redirects unauthorised roles.
2. **API level** — `requireAuth()` in route handlers returns `403` for insufficient roles. `canAccessVenue()` ensures venue_staff can only touch their assigned venues.

---

## Core Concepts

### Reservation lifecycle

```
submitted → confirmed  → completed
                       → no_show
                       → cancelled
         → pending_manual_review → (reassigned) → confirmed
                                 → cancelled
```

- **`confirmed`** — A table has been assigned automatically. The customer may receive a confirmation email.
- **`pending_manual_review`** — Auto-assignment failed. The reservation sits in the overflow queue until staff handles it.
- **`completed`** / **`no_show`** / **`cancelled`** — Terminal states set manually by staff.

### Auto-assignment

When a reservation is created (internal or via the public API), the `create_reservation_auto` PostgreSQL function runs the following logic in order:

1. Find a single available table that fits the party size and is free for the requested time window.
2. If no single table works, try combining tables (e.g. two tables of 4 for a party of 7).
3. If the venue belongs to a **venue group**, check sibling venues in priority order.
4. If nothing is found → status becomes `pending_manual_review`.

This logic is entirely in SQL to ensure atomicity — no race conditions from concurrent bookings.

### Overflow queue

Reservations in `pending_manual_review` appear in the overflow queue (`/dashboard/overflow`). Staff can:
- **Reassign** to a suggested option (system proposes same-venue/other-time or other-venue/same-time alternatives).
- **Manual pick** — choose any venue, any table(s) directly.
- **Cancel** the reservation if no options are available.

### Venue groups

Venues can be organised into groups. When overflow routing runs, group members are checked in ascending priority order, allowing cross-venue fallback (e.g. "if Venue A is full, try Venue B").

### Customer profiles

Every guest who makes a reservation is stored in the `customers` table, keyed by email or phone. Repeat bookings are matched to the existing customer record automatically via `get_or_create_customer`. Staff can browse all customers at `/dashboard/customers` and view their full reservation history.

---

## Dashboard Pages

| Route | Role | Description |
|---|---|---|
| `/dashboard` | All | Overview: today's stats, 7-day completion rate, quick links |
| `/dashboard/reservations` | All | All reservations with filters (status, source, venue, date range presets) |
| `/dashboard/overflow` | super_admin, support | Manual review queue with reassignment tool |
| `/dashboard/customers` | super_admin, support | Customer list with search and pagination |
| `/dashboard/customers/[id]` | super_admin, support | Customer detail: contact info, stats, full reservation history |
| `/dashboard/stats` | super_admin, support | Charts: daily volume, guest count, source breakdown, venue breakdown. Filterable by date range and venue |
| `/dashboard/venues` | super_admin | Venue list |
| `/dashboard/venues/[id]` | super_admin, support, venue_staff | Timeline, reservations, tables, table types, settings, open hours, integrations |
| `/dashboard/venue-groups` | super_admin | Group configuration and overflow priority order |
| `/dashboard/users` | super_admin | User creation, role assignment, venue assignment |

---

## Internal API

All internal routes require a valid session cookie. Unauthorised requests receive `401`. Insufficient role receives `403`.

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/reservations` | List reservations with filtering and pagination |
| `POST` | `/api/reservations` | Create reservation (admin-initiated) |
| `GET` | `/api/reservations/[id]` | Get single reservation |
| `PATCH` | `/api/reservations/[id]` | Update status, fields, or notes; trigger confirmation email |
| `GET` | `/api/overflow` | Get overflow queue |
| `POST` | `/api/overflow/[id]/reassign` | Reassign a pending reservation to new tables/venue/time |
| `GET` | `/api/overflow/[id]/options` | Get system-suggested reassignment options |
| `GET` | `/api/customers` | List customers with search and pagination |
| `GET` | `/api/customers/[id]` | Customer detail + full reservation history |
| `GET` | `/api/users` | List users |
| `POST` | `/api/users` | Create user |
| `PATCH` | `/api/users/[id]` | Update user role / venue assignment |

All responses follow a consistent envelope:

```json
// Success
{ "data": { ... } }

// Error
{ "error": "Human-readable message", "details": { ... } }
```

HTTP status codes map to standard meanings: `200` success, `201` created, `400` bad input, `401` unauthenticated, `403` forbidden, `404` not found, `409` conflict (e.g. time slot already taken), `422` business rule violation, `500` unexpected server error.

---

## Public Booking API

The public API requires no authentication and is designed for external sites (WordPress, landing pages) to integrate live availability and booking submission. Full documentation is in **[PUBLIC_API.md](PUBLIC_API.md)**.

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/public/venues` | List bookable venues with settings |
| `GET` | `/api/public/availability` | Available time slots for a date, party size, and venue |
| `POST` | `/api/public/reservations` | Submit a reservation from an external form |

**Security measures applied:**
- `BOOKING_API_KEY` env var — if set, all requests must include `X-Api-Key` header (for server-side WP integration).
- `window_hours` hard cap at 18 to prevent DB resource exhaustion.
- Past date and max-advance-days validation on both availability and submission.
- Hard party size ceiling (500) independent of venue settings.
- CORS headers on all responses, `OPTIONS` preflight supported.

**Remaining gap:** IP-based rate limiting is not implemented. For production with high traffic, add [Upstash Rate Limit](https://upstash.com/docs/redis/sdks/ratelimit/overview) — it integrates natively with Next.js middleware.

---

## Email Notifications

Transactional emails are sent via [Resend](https://resend.com). The email module is non-fatal — if sending fails or `RESEND_API_KEY` is not configured, the error is logged but the reservation is unaffected.

**Confirmation emails are sent when:**
- A reservation is auto-confirmed on creation (internal or public API) and the customer has an email address.
- A pending reservation is successfully reassigned and staff ticks "Send confirmation email".
- Staff manually triggers a confirmation from the reservation detail view.

**Template:** Inline HTML email with booking details table (venue, date, time, party size). Styled in dark header + light body layout.

**Sender address:** Configured via `EMAIL_FROM` env var. Defaults to `onboarding@resend.dev` (Resend's test address, works without domain verification). Set to a verified domain address before sending to real customers.

---

## Database Migrations

Migrations are plain `.sql` files in `schema/migrations/`, numbered sequentially. They are **applied manually** via the Supabase dashboard SQL editor or CLI — there is no auto-runner.

| File | Description |
|---|---|
| `001` | Fix table combination edge case |
| `002` | Fix cancel status ambiguity in PL/pgSQL |
| `003` | Fix window aggregate in table combination |
| `004–005` | Fix column reference ambiguity in reallocation functions |
| `006` | Cross-venue combined table suggestions |
| `007` | Venue groups, admin features |
| `008` | Group-aware reallocation options, `safe_is_within_venue_open_hours` wrapper |
| `009` | Remove `allow_alternative_time_suggestions` gate from support tool |
| `010` | Try combined tables for each alt-time candidate |
| `011` | Replace fixed-offset alt-times with LEAD() gap-scan approach |
| `012` | Fix gap-scan for combined-table parties; drop/recreate `get_reallocation_options` to handle parameter rename |
| `013` | Stats functions (`get_reservation_stats`, `get_source_stats`, `get_venue_stats`) and customer helpers (`get_customer_list`, `get_customer_count`) |

**To apply a migration:**
1. Open Supabase dashboard → SQL Editor.
2. Paste the contents of the migration file.
3. Run. Migrations are idempotent where possible (`create or replace`, `drop if exists`).

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# ── Supabase (required) ────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...

# ── Email via Resend (optional) ────────────────────────────────────────────────
# If not set, confirmation emails are silently skipped.
RESEND_API_KEY=re_...
EMAIL_FROM=ReserveOps <hello@yourdomain.com>

# ── Public API key (optional) ─────────────────────────────────────────────────
# If set, all requests to /api/public/* must include header: X-Api-Key: <value>
# Set this on the WordPress server config — never expose it in browser JS.
BOOKING_API_KEY=your-secret-key
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | — | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | — | Supabase anon/publishable key |
| `RESEND_API_KEY` | No | — | Enables transactional email sending |
| `EMAIL_FROM` | No | `onboarding@resend.dev` | Sender address shown to customers |
| `BOOKING_API_KEY` | No | — | Enables API key gate on public endpoints |

---

## Local Development

**Prerequisites:** Node.js 20+, npm

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**
```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

**3. Apply database migrations**

Open the Supabase dashboard for your project → SQL Editor → run each file in `schema/migrations/` in order (001 → 013).

**4. Start the development server**
```bash
npm run dev
```

The application is available at `http://localhost:3000`.

**5. Create your first user**

Users are created through Supabase Auth. After signing up, assign a role in the `user_roles` table:

```sql
insert into public.user_roles (user_id, role)
values ('<auth.users uuid>', 'super_admin');
```

---

## Deployment

The application is designed for deployment on **Vercel** with a **Supabase** backend.

**Vercel setup:**
1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Add all environment variables from the [Environment Variables](#environment-variables) section.
4. Deploy.

**Important:** The `schema/migrations/` files must still be applied manually to your production Supabase project before deploying. There is no automatic migration runner.

**Recommended production checklist:**
- [ ] All 13 migrations applied in Supabase production
- [ ] `RESEND_API_KEY` set and sender domain verified in Resend
- [ ] `EMAIL_FROM` set to a verified domain address
- [ ] `BOOKING_API_KEY` set if external booking forms are live
- [ ] At least one `super_admin` user created
- [ ] Venue(s) created and `booking_enabled = true` in venue settings
- [ ] Open hours configured per venue
- [ ] Tables configured per venue with correct `capacity_min` / `capacity_max`
