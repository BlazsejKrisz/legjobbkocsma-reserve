# Embed implementation prompt

A handoff brief for building (or updating) the public-facing reservation embed
that gets dropped onto partner websites (WordPress, custom landing pages,
restaurant homepages, etc.) and lets visitors book a table without leaving the
host site.

---

## Context

**The embed is the only consumer of `/api/public/*`.** The dashboard for staff
already exists, and the backend is fully wired for SMS, email, retries,
reminders, and observability. What's missing is a polished, mobile-friendly
public booking flow that respects the recent backend changes.

The host project is a Next.js 16 + Supabase reservation platform. The embed
itself is a separate client-side artifact (probably a single JS bundle hosted
on a CDN, embedded via `<script>` tag). It consumes 3 public endpoints and
must work cross-origin via CORS.

## Files to read first

| File | What it tells you |
|---|---|
| [`PUBLIC_API.md`](./PUBLIC_API.md) | Authoritative API contract: endpoints, request/response shapes, error codes, rate limits |
| [`app/api/public/reservations/route.ts`](./app/api/public/reservations/route.ts) | The reservation creation endpoint, including how email/SMS routing works |
| [`app/api/public/availability/route.ts`](./app/api/public/availability/route.ts) | Time-slot availability lookup |
| [`lib/validators/reservations.ts`](./lib/validators/reservations.ts) | Server-side Zod schemas — mirror these for client-side validation |
| [`lib/phone/parse.ts`](./lib/phone/parse.ts) | Phone normalization helper using `libphonenumber-js`. Same library should be used in the embed. |

## What changed recently (post-launch)

The backend now does several things the embed should leverage:

1. **Email confirmations and 2-hour reminders are automatic for embed bookings.**
   Public bookings always send email — there's no opt-out and no toggle on the
   embed side. Email is mandatory in the `customer.email` field.

2. **The reservation pipeline went async.** The endpoint returns 201 immediately;
   confirmation email lands in the guest's inbox 1–3 seconds later via a
   background outbox. Don't show "email sent" copy synchronously — say "we'll
   send a confirmation email shortly."

3. **Phone numbers are stored in E.164 format.** The backend uses
   `libphonenumber-js` to normalize. The embed should do the same client-side
   so we never POST a malformed number.

4. **Per-venue branding is available.** `GET /api/public/venues` returns
   `logo_url`, `address`, `phone`, `website`, `email_contact`. Use these to
   theme the embed per venue without forcing the host to configure anything.

5. **Honeypot + rate limiting + CORS whitelist exist.** See "Constraints" below.

## Required features

### Booking flow

1. **Venue picker** — multi-tenant (one embed, many venues). Each venue has a
   slug, name, and constraints (max party size, max advance booking days, min
   notice). For single-venue installations, the venue is configured at script
   embed time and the picker is hidden.

2. **Date + party size** — `<input type="date">` + numeric stepper. Both feed
   into the availability lookup.

3. **Time-slot list** — pulled from `GET /api/public/availability`. Render
   only the returned slots; don't generate fake ones. Empty array means "no
   availability on this date" (not an error).

4. **Customer details** — name (required), email (required for embed), phone
   (optional but with country code selector — see below), message (optional).

5. **Submit** — `POST /api/public/reservations`. Show:
   - Spinner during submit
   - On `status: confirmed` → success state with reservation number and
     "we'll send a confirmation email shortly"
   - On `status: pending_manual_review` → "we received your request, our team
     will get in touch within X hours"
   - On error → toast/inline error with the API's `error` message

6. **Mobile-first responsive** — most embed traffic comes from phones browsing
   restaurant homepages.

### Bilingual

- Hungarian default (most users), English fallback
- Detect host page language via `<html lang>` attribute, override with a query
  param if the host wants explicit control
- All copy in two locales — see [`lib/i18n/translations.ts`](./lib/i18n/translations.ts)
  for the existing string set if you want consistency with the dashboard

### Branding

- Pull venue branding from the venues endpoint
- Show the venue's logo in the embed header if present
- Use `email_contact` and `phone` in the success state ("any questions, call ...")

---

## Work items still to do

These are concrete tasks the embed needs before going live:

### 1. Country code selector for phone input ⭐ priority

Currently the phone field is plain text. International tourists (German,
British, US visitors to Budapest restaurants) can't reliably type their number.

**Implementation:**
- Add `react-phone-number-input` (already in the dashboard's `package.json`):
  ```tsx
  import PhoneInput from 'react-phone-number-input'
  import 'react-phone-number-input/style.css'

  <PhoneInput
    defaultCountry="HU"
    value={phone}
    onChange={setPhone}
    international
  />
  ```
- Output is E.164 (`+36701234567`), which the API expects.
- Library bundle is ~75kb gzipped — acceptable for the embed.

### 2. Server-side phone validation

The backend doesn't currently reject malformed phones in the public endpoint
(it does in the dashboard `from-availability` flow). Add similar validation
to `/api/public/reservations`:

```ts
import { toE164 } from '@/lib/phone/parse'

const phoneE164 = payload.customer.phone ? toE164(payload.customer.phone) : null
if (payload.customer.phone && !phoneE164) {
  return err('Invalid phone number', { status: 400 })
}
// Use phoneE164 instead of raw input downstream
```

### 3. Honeypot field

Already supported server-side. The embed must include a hidden field named
`website` (or similar — check `lib/api/publicGuard.ts` for the exact field name)
that legitimate users never fill in but bots typically do. Server rejects any
submission where it's non-empty.

### 4. Loading + error states

Match the dashboard's UX standards: skeleton loading for slot list, inline
errors below fields, clear distinction between confirmed and pending-review
success states.

### 5. Optional: capacity hint

When a slot has only single tables (no combos available), the embed could show
"limited availability" subtly to nudge faster bookings. Pull from availability
response if/when we extend it. Not blocking launch.

### 6. Embed configuration

The host page should be able to configure the embed via `data-*` attributes:

```html
<script src="https://embed.legjobbkocsma.hu/embed.js"
  data-venue-slug="stifler-kert"
  data-locale="hu"
  data-theme="dark"
></script>
<div id="legjobb-kocsma-embed"></div>
```

Required attributes:
- `data-venue-slug` (or `data-venue-slugs="a,b,c"` for multi-venue picker)

Optional:
- `data-locale` (`hu` or `en`, defaults to host page's `<html lang>`)
- `data-theme` (`light` or `dark`, defaults to detect via `prefers-color-scheme`)

---

## Constraints (don't skip)

### CORS

Each venue has an `allowed_origins` array (set in the dashboard's venue
settings). Production embeds must come from a whitelisted origin or the API
returns 403. For development, the venue admin adds `http://localhost:3000`
and similar.

### API key

`BOOKING_API_KEY` env var on the backend gates all public requests via the
`X-Api-Key` header. If set, the embed must include it. Currently optional —
check the deployment env. If used, the embed bundle must include the key
(it's not actually secret since anyone can read JS), it's just a basic gate.

### Rate limits

`/api/public/reservations` — 8 requests/minute per IP, plus per-email rate
limiting. The embed shouldn't see this in normal use, but on submit-failure
retry, back off rather than hammer.

`/api/public/availability` — 30 req/min per IP. The embed should debounce
date/party-size changes so a fast-typing user doesn't burn the budget.

### Honeypot

See work item 3.

### Reservation timing

Don't allow:
- Past times (`starts_at < now()`)
- Beyond `max_advance_booking_days` from now (per venue settings)
- Within `min_notice_minutes` from now (per venue settings)

The availability endpoint already filters these out, so just clamp the date
input's `min` and `max` attributes accordingly and you're set.

### Customer requirement

At minimum one of `email` or `phone` is required by the API. **For the embed
specifically, treat email as required** — the form should refuse to submit
without it, since email is the channel guests will receive their confirmation
on.

---

## Testing checklist

Before declaring the embed ready:

- [ ] Booking flow on iPhone Safari, Android Chrome, desktop Chrome, desktop Safari
- [ ] Multi-venue picker shows all active venues
- [ ] Single-venue config skips the picker
- [ ] Country code selector defaults to HU, switches to others fluidly
- [ ] Phone input rejects invalid formats client-side before submit
- [ ] Empty slot list shows friendly empty state, not an error
- [ ] Date input respects `min_notice_minutes` and `max_advance_booking_days`
- [ ] Honeypot rejection silently passes (no UX feedback to bots)
- [ ] Confirmation email arrives within ~5 seconds of submit
- [ ] CORS rejection from non-whitelisted origin shows clear error
- [ ] Hungarian and English copy renders correctly with accents
- [ ] Dark and light themes both look right
- [ ] Embed doesn't leak global CSS into the host page (use shadow DOM or
      CSS-in-JS with hashed class names)

---

## Reference: minimal flow code

```js
const BASE = 'https://foglalas.legjobbkocsma.hu/api/public'

// 1. Load venue + constraints
const { data: venues } = await fetch(`${BASE}/venues`).then(r => r.json())
const venue = venues.find(v => v.slug === VENUE_SLUG)

// 2. Check availability for the chosen date + party size
const slotsRes = await fetch(
  `${BASE}/availability?venue_slug=${VENUE_SLUG}&date=${date}&party_size=${partySize}`
)
const { slots } = await slotsRes.json()

// 3. Submit booking with E.164 phone
const res = await fetch(`${BASE}/reservations`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY && { 'X-Api-Key': API_KEY }),
  },
  body: JSON.stringify({
    venue_slug: VENUE_SLUG,
    starts_at: chosenSlot.starts_at,
    party_size: partySize,
    customer: {
      full_name: name,
      email,                    // REQUIRED for embed
      phone: phoneE164OrNull,   // E.164 form
    },
    message: optionalMessage,
    website: '',                // honeypot — must stay empty
  }),
})

if (!res.ok) {
  const { error } = await res.json()
  // show error UI
  return
}

const { data } = await res.json()
// data.status === 'confirmed' or 'pending_manual_review'
// data.reservation_id is the booking number to show the user
```
