# Master Prompt — Legjobbkocsma Booking Embed

## What you are building

A standalone, embeddable booking form that lives in its own repository and is served as a single HTML page. It is embedded on external websites (WordPress, Webflow, custom landing pages) via an `<iframe>` tag. The goal is that it looks completely native to the host site — no visible border, no scrollbar, seamless height.

The embed talks to the Legjobbkocsma reservation system API. No authentication required. CORS is open.

---

## Core business logic — read this first

The system has **no hard booking limit**. Every submitted reservation always enters the system:

- If a table can be auto-assigned → `status: "confirmed"`, confirmation email sent automatically by the backend
- If no table is free → `status: "pending_manual_review"`, the reservation lands in the staff overflow queue where support colleagues handle assignment manually

**Both outcomes are HTTP 201 — both are success from the embed's perspective.** `pending_manual_review` is not an error state, it is a normal part of the workflow. Never show it as a failure to the user.

---

## Tech stack

- **Vite** + vanilla TypeScript (no framework — keep it lean, this is a form not an app)
- **No CSS framework** — the form is unstyled by default. All visual properties come from CSS custom properties set via URL parameters (see Theming section)
- Output: a single deployable static site (`index.html` + bundled JS/CSS)

---

## How the seamless iframe works

The host site embeds the form like this:

```html
<iframe
  id="legjobbkocsma-booking"
  src="https://embed.legjobbkocsma.hu/?primary=%23e74c3c&font=Inter&radius=8px&venue=legjobb-kocsma"
  style="border:none; width:100%; overflow:hidden; display:block;"
  scrolling="no"
  allowtransparency="true">
</iframe>

<script>
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'lk:resize') {
      document.getElementById('legjobbkocsma-booking').style.height = e.data.height + 'px';
    }
  });
</script>
```

Three things make it seamless:

1. **Transparent background** — `body { background: transparent }` on the embed page. The iframe element has no border. It visually merges with whatever is behind it.

2. **Auto height via postMessage** — the embed measures `document.documentElement.scrollHeight` after every render change and sends it to the parent:
   ```js
   window.parent.postMessage({ type: 'lk:resize', height: document.documentElement.scrollHeight }, '*')
   ```
   Send this after: initial load, venue load, slot load, form step changes, validation errors appearing, success/error states.

3. **CSS custom properties from URL params** — the host passes design tokens in the `src` URL. The embed reads them on load and injects them as CSS variables onto `:root`.

---

## URL parameters

All URL parameters are optional.

### Theming

Read from `new URLSearchParams(window.location.search)`, set via `document.documentElement.style.setProperty(...)`:

| URL param    | CSS variable      | Fallback      | What it controls                    |
|--------------|-------------------|---------------|-------------------------------------|
| `primary`    | `--lk-primary`    | `#111827`     | Button color, active states         |
| `primary_fg` | `--lk-primary-fg` | `#ffffff`     | Text on primary buttons             |
| `font`       | `--lk-font`       | `inherit`     | Font family (applied to body)       |
| `radius`     | `--lk-radius`     | `6px`         | Border radius on inputs and buttons |
| `border`     | `--lk-border`     | `#e5e7eb`     | Input and card border color         |
| `text`       | `--lk-text`       | `#111827`     | Main text color                     |
| `muted`      | `--lk-muted`      | `#6b7280`     | Label and secondary text            |
| `bg`         | `--lk-bg`         | `transparent` | Form background                     |

All CSS in the embed uses only these variables — never hardcoded colors, fonts, or radii.

### Behaviour

| URL param      | Values              | Default | Behaviour                                                                 |
|----------------|---------------------|---------|---------------------------------------------------------------------------|
| `venue`        | venue slug          | —       | Pre-selects a single venue, hides the venue selector                      |
| `venue_group`  | group slug          | —       | Loads only venues belonging to this group, shows venue selector           |
| `slots`        | `1` or `0`         | `0`     | `1` enables real-time availability slot picker (see Availability section) |

If neither `venue` nor `venue_group` is set, all active venues are loaded into the selector.

---

## Form structure

Fields in order:

1. **Venue selector** — `<select>`, populated from `/api/public/venues`. Hidden if `venue` param pre-selects one. Filtered by group if `venue_group` is set.
2. **Date** — `<input type="date">`. Min: today. Max: today + `max_advance_booking_days` from venue settings.
3. **Time** — see Availability section below.
4. **Party size** — `<input type="number">` min 1, max from venue settings (`max_party_size`).
5. **Full name** — text input, required.
6. **Email** — email input. Required if phone is empty.
7. **Phone** — tel input. Required if email is empty.
8. **Message** — textarea, optional. Placeholder: "Különleges kérés, megjegyzés…"
9. **Submit button** — disabled until all required fields are valid.

---

## Availability (`slots=1`)

When `slots=1` is in the URL, the time field becomes a dynamic slot picker instead of a plain time input.

**Trigger:** fetch availability whenever `date` or `party_size` changes (and venue is selected).

```
GET /api/public/availability?venue_slug=...&date=...&party_size=...
```

**States to handle:**

| State | What to show |
|---|---|
| Loading | Skeleton or spinner in the slot area |
| Slots returned | `<select>` with times converted to local: `new Date(slot.starts_at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })` |
| Empty slots `[]` | "Erre a napra nincs szabad időpont, de igényét így is elküldheti." + fall back to plain `<input type="time">` |
| API error | "Nem sikerült betölteni az időpontokat." + fall back to plain `<input type="time">` |

When `slots=0` (default): always show plain `<input type="time">`, no availability fetch.

In both cases the form is always submittable — `pending_manual_review` is a normal outcome, not a fallback error.

---

## API reference

**Base URL:** `VITE_API_BASE` env variable, e.g. `https://reservations.legjobbkocsma.hu/api/public`

---

### GET /venues

Returns active venues with booking enabled.

Optional query param: `group_slug` — filters to venues belonging to that group.

Response:
```json
{
  "data": [
    {
      "id": 1,
      "name": "Legjobb Kocsma",
      "slug": "legjobb-kocsma",
      "venue_settings": {
        "booking_enabled": true,
        "min_notice_minutes": 60,
        "max_advance_booking_days": 90,
        "min_duration_minutes": 60,
        "max_duration_minutes": 240,
        "max_party_size": 20
      }
    }
  ]
}
```

---

### GET /availability

Only called when `slots=1`.

```
GET /availability?venue_slug=legjobb-kocsma&date=2026-05-10&party_size=4
```

Response:
```json
{
  "slots": [
    { "starts_at": "2026-05-10T17:00:00.000Z", "ends_at": "2026-05-10T19:00:00.000Z" },
    { "starts_at": "2026-05-10T19:00:00.000Z", "ends_at": "2026-05-10T21:00:00.000Z" }
  ]
}
```

`slots` is `[]` if nothing available — not an error. Times are UTC, convert to local for display.

---

### POST /reservations

```
POST /reservations
Content-Type: application/json
```

Body:
```json
{
  "venue_slug": "legjobb-kocsma",
  "starts_at": "2026-05-10T18:00:00",
  "party_size": 4,
  "customer": {
    "full_name": "Kiss János",
    "email": "janos@example.com",
    "phone": "+36301234567"
  },
  "message": "Ablak mellé kérném ha lehet"
}
```

Required: `venue_slug`, `starts_at`, `party_size`, `customer.full_name`, and at least one of `customer.email` or `customer.phone`.

Response `201`:
```json
{
  "reservation_id": 42,
  "status": "confirmed",
  "venue_name": "Legjobb Kocsma",
  "starts_at": "2026-05-10T18:00:00.000Z",
  "ends_at": "2026-05-10T20:00:00.000Z",
  "party_size": 4
}
```

**Both statuses are success — handle them differently in the UI:**

| Status | Message to user |
|---|---|
| `confirmed` | "Foglalás visszaigazolva! Visszaigazolót küldtünk emailben. (#42)" |
| `pending_manual_review` | "Köszönjük! Foglalási igényét megkaptuk. Kollégáink hamarosan visszaigazolják az asztalt." |

The backend sends the appropriate email automatically in both cases — the embed does not send emails.

---

### POST /track

Lightweight anonymous event logging. No personal data. No cookies. No user identifiers. GDPR-safe.

```
POST /track
Content-Type: application/json
```

Fire these events:

| Event | When | Extra fields |
|---|---|---|
| `load` | Embed page loads | `venue_slug` (if pre-set) |
| `slots_loaded` | Availability fetch returns | `slot_count` |
| `slots_empty` | Availability returns `[]` | — |
| `submit` | Successful POST /reservations | `status` (`confirmed` or `pending_manual_review`) |
| `error` | API returns error | `code`, `reason` |

**Error reasons — use these fixed strings, never raw API messages (which may contain user input):**

```ts
function toErrorReason(status: number, message: string): string {
  if (status === 422 && message.includes('party size')) return 'party_size_exceeded'
  if (status === 422 && message.includes('not accepting')) return 'booking_disabled'
  if (status === 404) return 'venue_not_found'
  if (status === 400) return 'invalid_payload'
  return 'unknown'
}
```

Example payloads:
```json
{ "event": "load",         "domain": "stiflertkert.hu", "venue_slug": "stifler-kert" }
{ "event": "slots_loaded", "domain": "stiflertkert.hu", "slot_count": 4 }
{ "event": "slots_empty",  "domain": "stiflertkert.hu" }
{ "event": "submit",       "domain": "stiflertkert.hu", "status": "confirmed" }
{ "event": "error",        "domain": "stiflertkert.hu", "code": 422, "reason": "party_size_exceeded" }
```

Get `domain` from `document.referrer` parsed as `new URL(document.referrer).hostname`. If referrer is empty, use `"direct"`.

Do not store: IP address, reservation_id, any user-entered values.

---

## postMessage events

The embed sends to `window.parent`:

| Type | Payload | When |
|---|---|---|
| `lk:resize` | `{ height: number }` | After every render change |
| `lk:confirmed` | `{ reservation_id, status }` | After successful submission |

The host site can listen to `lk:confirmed` to fire analytics or conversion events:
```js
window.addEventListener('message', function(e) {
  if (e.data?.type === 'lk:resize') {
    document.getElementById('legjobbkocsma-booking').style.height = e.data.height + 'px';
  }
  if (e.data?.type === 'lk:confirmed') {
    // fire GA4 / Meta pixel conversion event here
    gtag('event', 'purchase', { transaction_id: e.data.reservation_id });
  }
});
```

---

## What the embed does NOT do

- No styling opinions beyond CSS variable fallbacks
- No routing — one page, one form
- No authentication
- No payment
- No emails — handled entirely by the backend

---

## Backend requirements (not embed work — for the reservation system developer)

These need to be implemented on the backend side for the full integration to work:

| Feature | Detail |
|---|---|
| Per-venue email branding | Confirmation emails should use venue-specific logo, colours, reply-to address — not a single hardcoded template |
| Operator notification email | When a reservation is submitted via embed (`source: partner`), the venue operator should receive a notification email — currently only the customer gets one |
| `group_slug` filter on `/api/public/venues` | Required for venue group embeds — filter venues by group |
| `embed_events` table + `/api/public/track` endpoint | Stores anonymous embed analytics events (load, submit, error) with domain and event type |
| MailChimp integration | If `subscribe_newsletter: true` is added to the POST /reservations body, the customer should be added to the correct MailChimp interest group (based on venue/brand). The embed only sends the flag — backend handles the MailChimp API call. |

---

## Environment variables

```
VITE_API_BASE=https://reservations.legjobbkocsma.hu/api/public
```

---

## Deployment

Build output (`dist/`) is a static site. Deploy to Vercel, Netlify, or Cloudflare Pages. The deploy URL goes into the `src` of the `<iframe>` on external sites.
