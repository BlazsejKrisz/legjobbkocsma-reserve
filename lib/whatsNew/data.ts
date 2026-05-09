// Changelog for the dashboard's "What's new" dialog.
// Newest entry first.  Version strings are date-based (yyyy-mm-dd) — the
// "Whatʼs new" button compares the latest version against localStorage to
// show an unread dot.

export type ChangeIcon =
  | 'sms'
  | 'email'
  | 'bell'
  | 'check'
  | 'chart'
  | 'search'
  | 'phone'
  | 'sparkle'
  | 'sliders'

export type ChangeItem = {
  icon: ChangeIcon
  title: { hu: string; en: string }
  description: { hu: string; en: string }
}

export type ChangelogEntry = {
  version: string  // yyyy-mm-dd, sortable
  date: string     // ISO date for display
  items: ChangeItem[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026-05-09',
    date: '2026-05-09',
    items: [
      {
        icon: 'search',
        title: {
          hu: 'Új: Ellenőrzött foglalás oldal',
          en: 'New: Verified booking page',
        },
        description: {
          hu: 'Telefonos foglaláshoz gyors elérhetőség-ellenőrzés egy oldalon. Ha a kért időpontban nincs hely, automatikusan felajánlja a közeli időpontokat és a csoport más helyszíneit. Kiválasztás után rögtön megerősítheted a foglalást — nem kell külön létrehozni.',
          en: 'One-page availability lookup for phone bookings. When the requested slot is full, you automatically see alternative times nearby and other venues in the same group. Pick one, fill in the guest, confirm — done.',
        },
      },
      {
        icon: 'email',
        title: {
          hu: 'Email visszaigazolás és emlékeztető',
          en: 'Email confirmations and reminders',
        },
        description: {
          hu: 'Ha a vendégnek van email címe és foglaláskor az Email csatornát választod, automatikusan kap visszaigazoló emailt: helyszín, dátum, létszám, saját adatai és a lemondási telefonszám. Külső weboldalakról (embed) érkező foglalások mindig kapnak email visszaigazolást és 2 órás emlékeztetőt is — ott kötelező az email mező.',
          en: 'When a guest has an email and you pick the Email channel at booking, they get an automatic confirmation: venue, date, party size, their own details, and the cancellation phone number. Bookings from external sites (embed) always receive email confirmation and a 2-hour reminder — email is mandatory there.',
        },
      },
      {
        icon: 'sms',
        title: {
          hu: 'SMS visszaigazolás telefonos vendégeknek',
          en: 'SMS confirmations for phone-only guests',
        },
        description: {
          hu: 'Ha a vendégtől csak telefonszámot kapsz és az SMS csatornát választod, SMS-ben megy ki a visszaigazolás és az emlékeztető. Foglaláskor egyszerű választó: Email / SMS / Nincs — a rendszer automatikusan azt választja, amihez van adat.',
          en: 'When you only have a phone number and pick the SMS channel, the confirmation and reminder go out via SMS. A simple Email / SMS / None picker on every booking, auto-defaulting to whatever contact you have.',
        },
      },
      {
        icon: 'bell',
        title: {
          hu: 'Automatikus emlékeztető 2 órával előtte',
          en: 'Automatic 2-hour reminder',
        },
        description: {
          hu: 'Minden megerősített foglalás előtt ~2 órával a vendég kap egy emlékeztetőt — ugyanazon a csatornán, mint a visszaigazolást (email vagy SMS). Csökkenti a no-show-t, neked nem kell csinálnod semmit.',
          en: 'Every confirmed reservation triggers an automatic reminder ~2 hours before start, on the same channel as the confirmation. Cuts no-shows without you doing anything.',
        },
      },
      {
        icon: 'check',
        title: {
          hu: 'Új menüpont: Értesítések',
          en: 'New menu: Notifications',
        },
        description: {
          hu: 'Minden kimenő email és SMS itt látszik: kinek ment, mikor, sikeres volt-e. Ha valami nem jutott el a vendéghez, egy gombbal újrapróbálhatod. Hasznos, ha visszahívnak hogy „nem kaptam meg a foglalást”.',
          en: 'Every outgoing email and SMS shows up here: who, when, did it land. If something didn\'t reach the guest, one click retries it. Useful when a guest calls in saying "I never got the confirmation."',
        },
      },
      {
        icon: 'check',
        title: {
          hu: 'Lemondás és módosítás értesítés',
          en: 'Cancellation and modification notifications',
        },
        description: {
          hu: 'Ha lemondasz vagy módosítasz egy foglalást a felületen (dátum, idő vagy létszám), a vendég automatikusan kap értesítést azon a csatornán, amit a foglaláskor választottál. „Foglalás módosítva és megerősítve” email tartalmazza az új részleteket.',
          en: 'When you cancel or modify a reservation (date, time, or party size), the guest gets an automatic notification on the channel chosen at booking. The "updated and reconfirmed" email contains the new details.',
        },
      },
      {
        icon: 'search',
        title: {
          hu: 'Szerkesztésnél elérhetőség-ellenőrzés',
          en: 'Availability check in the edit dialog',
        },
        description: {
          hu: 'Ha szerkesztéskor megváltoztatod a dátumot, időpontot vagy létszámot, egy „Ellenőrzés” gomb jelenik meg. Ha az új feltételekre van hely, normálisan elmented. Ha nincs, a Mentés gomb átvált „Mentés kézi feldolgozásra” módra — a foglalás az overflow sorba kerül.',
          en: 'When you change date, time, or party size in the edit dialog, a "Check" button appears. If the new criteria fit, save normally. If they don\'t, the Save button switches to "Save to overflow queue" — the reservation goes to manual review.',
        },
      },
      {
        icon: 'sparkle',
        title: {
          hu: 'Várólista jelző az overflow soron',
          en: 'Waitlist match indicator on the overflow queue',
        },
        description: {
          hu: 'Ha egy másik foglalás lemondása miatt felszabadul egy hely, az overflow sor érintett tétele zöld „Most beférne” jelzést kap. Beérkezési sorrendben listázva — a legrégebbi várakozó kerül elsőként a tetejére. Egy kattintás és átállíthatod.',
          en: 'When another reservation cancels and frees up a slot, the matching overflow row gets a green "Now fits" badge. Items are listed in arrival order — oldest first — so the longest-waiting guest surfaces first. One click to reassign.',
        },
      },
    ],
  },
]

// CHANGELOG is hand-maintained and always non-empty; the optional
// chain placates `noUncheckedIndexedAccess` while keeping intent clear.
export const LATEST_VERSION = CHANGELOG[0]?.version ?? '0.0.0'
