# ReserveOps — Public Booking API

This API is designed for external sites (WordPress, custom landing pages, etc.) to integrate
live availability checking and reservation submission. No authentication is required.
All endpoints support CORS so they can be called directly from browser JavaScript.

---

## Base URL

```
https://your-domain.com/api/public
```

Replace `your-domain.com` with your actual deployment URL.

---

## How the full booking flow works

```
1. Load venues         GET /api/public/venues
        ↓
   Pick a venue, get its slug + constraints (max party size, advance booking limit, etc.)

2. Check availability  GET /api/public/availability?venue_slug=...&date=...&party_size=...
        ↓
   Get a list of time slots where a table (or combination of tables) can fit the party.
   Only real, bookable slots are returned — no phantom times.

3. Submit booking      POST /api/public/reservations
        ↓
   System auto-assigns the best available table(s).
   If a table is found  → status: "confirmed", confirmation email sent to customer.
   If no table is free  → status: "pending_manual_review", lands in the staff overflow queue.
```

---

## Endpoints

### GET /api/public/venues

Returns all active venues that have online booking enabled.
Use this to populate a venue selector on your booking form.

**No parameters.**

**Response `200`:**
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

| Field | Description |
|---|---|
| `slug` | Use this as `venue_slug` in all other requests |
| `min_notice_minutes` | Minimum lead time — don't offer slots sooner than this from now |
| `max_advance_booking_days` | Don't offer slots further ahead than this |
| `min_duration_minutes` / `max_duration_minutes` | Valid booking length range |
| `max_party_size` | Reject parties larger than this before even calling availability |

---

### GET /api/public/availability

Returns available time slots for a given venue, date, and party size.
Every slot returned is guaranteed to have at least one table (or table combination) free.

**Query parameters:**

| Param | Required | Example | Description |
|---|---|---|---|
| `venue_slug` | yes | `legjobb-kocsma` | From the venues list |
| `date` | yes | `2026-05-10` | `YYYY-MM-DD` format |
| `party_size` | yes | `4` | Number of guests |
| `duration_minutes` | no | `120` | How long the booking lasts. Defaults to the venue's configured value |
| `window_hours` | no | `8` | How many hours of the day to scan starting from midnight. Default `8` (midnight → 08:00) |

**Example request:**
```
GET /api/public/availability?venue_slug=legjobb-kocsma&date=2026-05-10&party_size=4
```

**Response `200`:**
```json
{
  "venue_id": 1,
  "venue_name": "Legjobb Kocsma",
  "date": "2026-05-10",
  "party_size": 4,
  "duration_minutes": 120,
  "slots": [
    {
      "starts_at": "2026-05-10T17:00:00.000Z",
      "ends_at":   "2026-05-10T19:00:00.000Z"
    },
    {
      "starts_at": "2026-05-10T19:00:00.000Z",
      "ends_at":   "2026-05-10T21:00:00.000Z"
    }
  ]
}
```

`slots` is an empty array `[]` if nothing is available — not an error.

**Note on timezones:** `starts_at` / `ends_at` are in UTC (ISO 8601 with `Z`).
Convert to local time for display: `new Date(slot.starts_at).toLocaleTimeString(...)`.

**Error responses:**

| Status | `error` message | Meaning |
|---|---|---|
| `400` | `venue_slug is required` | Missing param |
| `400` | `date is required (YYYY-MM-DD)` | Bad date format |
| `404` | `Venue '...' not found` | Wrong slug or venue is inactive |
| `422` | `Venue is not accepting bookings` | Booking disabled in settings |
| `422` | `Party size exceeds venue maximum (N)` | Party too large |

---

### POST /api/public/reservations

Submits a reservation. The system attempts to auto-assign the best available table.

**Headers:**
```
Content-Type: application/json
```

**Request body:**
```json
{
  "venue_slug": "legjobb-kocsma",
  "starts_at": "2026-05-10T18:00:00",
  "party_size": 4,
  "duration_minutes": 120,
  "customer": {
    "full_name": "John Smith",
    "email": "john@example.com",
    "phone": "+36301234567"
  },
  "message": "Window seat preferred if possible",
  "area": "terrace",
  "table_type_code": "booth"
}
```

| Field | Required | Description |
|---|---|---|
| `venue_slug` | yes | From venues list |
| `starts_at` | yes | ISO datetime. Can be local (no `Z`) or UTC |
| `party_size` | yes | Number of guests (integer) |
| `duration_minutes` | no | Falls back to venue default if omitted |
| `customer.full_name` | yes | Guest's name |
| `customer.email` | no* | At least one of `email` or `phone` is required |
| `customer.phone` | no* | |
| `message` | no | Special requests — shown to staff, stored on the reservation |
| `area` | no | Seating area preference (e.g. `"terrace"`, `"main hall"`) |
| `table_type_code` | no | Request a specific table type by its code (configured in admin) |

**Response `201` — confirmed:**
```json
{
  "reservation_id": 42,
  "status": "confirmed",
  "venue_id": 1,
  "venue_name": "Legjobb Kocsma",
  "starts_at": "2026-05-10T18:00:00.000Z",
  "ends_at":   "2026-05-10T20:00:00.000Z",
  "party_size": 4
}
```

**Response `201` — needs manual review:**
```json
{
  "reservation_id": 43,
  "status": "pending_manual_review",
  "venue_id": 1,
  "venue_name": "Legjobb Kocsma",
  "starts_at": "2026-05-10T18:00:00.000Z",
  "ends_at":   "2026-05-10T20:00:00.000Z",
  "party_size": 4
}
```

When `status` is `pending_manual_review`, the reservation is in the system but no table has been
assigned. Staff will see it in the overflow queue and either reassign it to a free slot/venue or
contact the customer. **The HTTP status is still `201`** — the booking was received successfully,
it just needs manual handling.

**Error responses:**

| Status | `error` message | Meaning |
|---|---|---|
| `400` | `Invalid payload` | Missing/malformed fields. Check `details` in the response |
| `404` | `Venue '...' not found` | Wrong slug or venue is inactive |
| `422` | `Venue is not accepting bookings` | Disabled in settings |
| `422` | `Party size exceeds venue maximum (N)` | Too many guests |

---

## Full WordPress / JavaScript example

```html
<!-- Booking form -->
<form id="booking-form">
  <select id="venue"></select>
  <input type="date" id="date" />
  <input type="number" id="party-size" value="2" min="1" />
  <select id="time-slot"></select>
  <input type="text" id="name" placeholder="Full name" />
  <input type="email" id="email" placeholder="Email" />
  <input type="tel" id="phone" placeholder="Phone" />
  <textarea id="message" placeholder="Any special requests?"></textarea>
  <button type="submit">Book now</button>
</form>

<script>
const BASE = 'https://your-domain.com/api/public';

// ─── Step 1: Load venues on page load ────────────────────────────────────────
async function loadVenues() {
  const res = await fetch(`${BASE}/venues`);
  const { data } = await res.json();

  const select = document.getElementById('venue');
  for (const v of data) {
    const opt = document.createElement('option');
    opt.value = v.slug;
    opt.textContent = v.name;
    opt.dataset.maxParty = v.venue_settings.max_party_size;
    select.appendChild(opt);
  }
}

// ─── Step 2: Load available slots when date or party size changes ─────────────
async function loadSlots() {
  const slug      = document.getElementById('venue').value;
  const date      = document.getElementById('date').value;
  const partySize = document.getElementById('party-size').value;

  if (!slug || !date || !partySize) return;

  const url = `${BASE}/availability?venue_slug=${slug}&date=${date}&party_size=${partySize}`;
  const res = await fetch(url);

  if (!res.ok) {
    const { error } = await res.json();
    alert(`Could not load slots: ${error}`);
    return;
  }

  const { slots } = await res.json();
  const select = document.getElementById('time-slot');
  select.innerHTML = '';

  if (slots.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'No availability on this date';
    opt.disabled = true;
    select.appendChild(opt);
    return;
  }

  for (const slot of slots) {
    const opt = document.createElement('option');
    opt.value = slot.starts_at;
    opt.dataset.endsAt = slot.ends_at;
    // Convert UTC to local for display
    opt.textContent = new Date(slot.starts_at).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit'
    });
    select.appendChild(opt);
  }
}

// ─── Step 3: Submit the booking ───────────────────────────────────────────────
document.getElementById('booking-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const slug      = document.getElementById('venue').value;
  const startsAt  = document.getElementById('time-slot').value;
  const partySize = Number(document.getElementById('party-size').value);
  const name      = document.getElementById('name').value;
  const email     = document.getElementById('email').value;
  const phone     = document.getElementById('phone').value;
  const message   = document.getElementById('message').value;

  const res = await fetch(`${BASE}/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      venue_slug: slug,
      starts_at:  startsAt,
      party_size: partySize,
      customer: { full_name: name, email, phone },
      message,
    }),
  });

  const result = await res.json();

  if (!res.ok) {
    alert(`Booking failed: ${result.error}`);
    return;
  }

  if (result.status === 'confirmed') {
    alert(`Booking confirmed! Confirmation #${result.reservation_id}. Check your email.`);
  } else {
    // pending_manual_review
    alert(`We received your request (#${result.reservation_id}). ` +
          `Our team will confirm your table shortly.`);
  }
});

// Wire up events
document.getElementById('date').addEventListener('change', loadSlots);
document.getElementById('party-size').addEventListener('change', loadSlots);
document.addEventListener('DOMContentLoaded', loadVenues);
</script>
```

---

## Environment variables required

These must be set on your ReserveOps deployment for the full flow to work:

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase anon key |
| `RESEND_API_KEY` | no | If not set, confirmation emails are silently skipped |
| `EMAIL_FROM` | no | Sender address, e.g. `ReserveOps <hello@yourdomain.com>`. Defaults to `onboarding@resend.dev` (Resend test address) |

---

## What happens on the backend when a booking is submitted

1. **Venue lookup** — slug is resolved to a venue ID; booking_enabled is checked.
2. **Customer upsert** — the customer is looked up by email or phone. If they exist, their name is updated. If not, a new customer record is created. This is how reservation history is built up automatically.
3. **Auto-assignment** (`create_reservation_auto` SQL function):
   - Tries to find a single table that fits the party size and is free for the requested time.
   - If no single table works, tries combinations of tables (e.g. two tables of 4 for a party of 6).
   - If the venue belongs to a group and no table is found, checks overflow routing rules (sibling venues, priority order).
   - If still nothing → status becomes `pending_manual_review`.
4. **Confirmation email** — if status is `confirmed` and the customer has an email, a confirmation is sent via Resend. If `RESEND_API_KEY` is not configured, this step is silently skipped and the reservation is still created.
5. **Response** — always `201` if the reservation was received, regardless of confirmed/pending status.
