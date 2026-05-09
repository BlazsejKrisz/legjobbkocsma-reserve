// Branded ID types — nominally distinct from `string` and `number` so
// the type checker prevents mixing them.  Without branding, the codebase
// has a long-standing schism: `Reservation.requested_venue_id: string`
// vs. `useAvailability(venueId: number)` vs. validators with
// `z.coerce.number()`.  A `Number(venueId)` coerce is sprinkled at every
// call site and any of them could silently swap a userId for a venueId.
//
// With brands, each ID type can only be created via its constructor,
// which validates the underlying primitive.  Cross-assignment yields a
// compile error.
//
// The brand is a type-only phantom field (compiles to nothing).  Adoption
// is incremental: callers pass the brand through, and the API boundary
// (validators / route param parse) is where unbranded primitives become
// branded values.

declare const __brand: unique symbol

export type VenueId       = string & { readonly [__brand]: 'VenueId' }
export type ReservationId = string & { readonly [__brand]: 'ReservationId' }
export type TableId       = string & { readonly [__brand]: 'TableId' }
export type TableTypeId   = string & { readonly [__brand]: 'TableTypeId' }
export type CustomerId    = string & { readonly [__brand]: 'CustomerId' }
export type UserId        = string & { readonly [__brand]: 'UserId' }

// Constructors / converters.  Each accepts the loose form (string or
// number — the DB returns bigints as strings via PostgREST, but the app
// receives them as numbers in many places after `Number()` coercion)
// and produces a branded value or throws.  This is the ONLY way to
// create a branded ID — call sites can't `as VenueId` an arbitrary
// string.

function asPositiveIntString(input: string | number, label: string): string {
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input <= 0) {
      throw new TypeError(`${label}: expected positive integer, got ${input}`)
    }
    return String(input)
  }
  if (typeof input === 'string') {
    if (!/^\d+$/.test(input) || input === '0') {
      throw new TypeError(`${label}: expected positive integer string, got ${JSON.stringify(input)}`)
    }
    return input
  }
  throw new TypeError(`${label}: expected string or number, got ${typeof input}`)
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asUuidString(input: string, label: string): string {
  if (typeof input !== 'string' || !UUID_RX.test(input)) {
    throw new TypeError(`${label}: expected UUID, got ${JSON.stringify(input)}`)
  }
  return input
}

export const VenueId = {
  parse(input: string | number): VenueId {
    return asPositiveIntString(input, 'VenueId') as VenueId
  },
  /** Safe parse — returns null on invalid input.  Use in route handlers
   *  where you'd otherwise return a 400 manually. */
  safeParse(input: string | number | null | undefined): VenueId | null {
    if (input === null || input === undefined) return null
    try { return VenueId.parse(input) } catch { return null }
  },
} as const

export const ReservationId = {
  parse(input: string | number): ReservationId {
    return asPositiveIntString(input, 'ReservationId') as ReservationId
  },
  safeParse(input: string | number | null | undefined): ReservationId | null {
    if (input === null || input === undefined) return null
    try { return ReservationId.parse(input) } catch { return null }
  },
} as const

export const TableId = {
  parse(input: string | number): TableId {
    return asPositiveIntString(input, 'TableId') as TableId
  },
  safeParse(input: string | number | null | undefined): TableId | null {
    if (input === null || input === undefined) return null
    try { return TableId.parse(input) } catch { return null }
  },
} as const

export const TableTypeId = {
  parse(input: string | number): TableTypeId {
    return asPositiveIntString(input, 'TableTypeId') as TableTypeId
  },
  safeParse(input: string | number | null | undefined): TableTypeId | null {
    if (input === null || input === undefined) return null
    try { return TableTypeId.parse(input) } catch { return null }
  },
} as const

export const CustomerId = {
  parse(input: string | number): CustomerId {
    return asPositiveIntString(input, 'CustomerId') as CustomerId
  },
  safeParse(input: string | number | null | undefined): CustomerId | null {
    if (input === null || input === undefined) return null
    try { return CustomerId.parse(input) } catch { return null }
  },
} as const

export const UserId = {
  parse(input: string): UserId {
    return asUuidString(input, 'UserId') as UserId
  },
  safeParse(input: string | null | undefined): UserId | null {
    if (input === null || input === undefined) return null
    try { return UserId.parse(input) } catch { return null }
  },
} as const
