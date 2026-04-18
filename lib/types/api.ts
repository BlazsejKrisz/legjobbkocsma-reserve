export type ApiError<TDetails = unknown> = {
  error: string
  details?: TDetails
}

export type ApiSuccess<T> = {
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

export async function apiFetch<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    const body: ApiError = json ?? { error: `HTTP ${res.status}` }
    throw new ApiClientError(res.status, body)
  }

  return json as T
}
