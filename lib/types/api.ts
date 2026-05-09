// Discriminated API response — every server response carries an `ok`
// flag so consumers can narrow with a single switch.  Structurally
// compatible with the legacy `{ data }` / `{ error }` envelopes; new
// callers should prefer `apiData<T>` which unwraps automatically.

export type ApiError<TDetails = unknown> = {
  ok?: false
  error: string
  details?: TDetails
}

export type ApiSuccess<T> = {
  ok?: true
  data: T
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.error)
    this.name = 'ApiClientError'
  }
}

// Merge headers from any of (Headers | Record | array of pairs).
// The previous implementation only spread plain objects, so passing
// `new Headers(...)` would silently drop the values.
function mergeHeaders(init?: HeadersInit): Headers {
  const out = new Headers()
  out.set('Content-Type', 'application/json')
  if (!init) return out
  if (init instanceof Headers) {
    init.forEach((v, k) => out.set(k, v))
  } else if (Array.isArray(init)) {
    for (const [k, v] of init) out.set(k, v)
  } else {
    for (const [k, v] of Object.entries(init)) {
      if (typeof v === 'string') out.set(k, v)
    }
  }
  return out
}

/**
 * Lower-level fetch helper.  Returns the parsed JSON body on success,
 * throws `ApiClientError` on HTTP failure.  The generic `T` is asserted —
 * use `apiData<T>` (or run a Zod schema yourself) when you need runtime
 * validation.
 */
export async function apiFetch<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: mergeHeaders(init?.headers),
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    const body: ApiError = json ?? { error: `HTTP ${res.status}` }
    throw new ApiClientError(res.status, body)
  }

  return json as T
}

/**
 * Higher-level helper that unwraps the standard `{ data: T }` envelope.
 *
 * Lets call sites write
 *   const reservations = await apiData<Reservation[]>('/api/reservations')
 * instead of
 *   const r = await apiFetch<{ data: Reservation[] }>('/api/reservations'); return r.data
 *
 * This eliminates a lot of manual envelope wrapping in hooks.  When the
 * response shape doesn't have `data`, fall back to `apiFetch<T>`.
 */
export async function apiData<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const wrapped = await apiFetch<{ data: T }>(input, init)
  return wrapped.data
}
