// lib/api/http.ts
import { NextResponse } from "next/server"

export type ApiInit = Omit<ResponseInit, "status"> & { status?: number }

export type ApiErrorBody<TDetails = unknown> = {
  error: string
  details?: TDetails
}

export function ok<T>(data: T, init?: ApiInit) {
  return NextResponse.json(data, { status: init?.status ?? 200, ...init })
}

export function err<TDetails = unknown>(message: string, init?: ApiInit & { details?: TDetails }) {
  const body: ApiErrorBody<TDetails> = { error: message }
  if (init?.details !== undefined) body.details = init.details
  return NextResponse.json(body, { status: init?.status ?? 500, ...init })
}

export async function safeJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export type DbError = {
  message: string
  code?: string
  hint?: string | null
  details?: string | null
}

// Maps PostgreSQL / PostgREST error codes to HTTP status codes so that DB
// errors are never blindly returned as 500 when they represent a client issue.
const DB_STATUS: Record<string, number> = {
  PGRST116: 404, // .single() returned no rows
  "23505": 409,  // unique_violation
  "23503": 409,  // foreign_key_violation
  "23P01": 409,  // exclusion_violation (GiST overlap)
  "42501": 403,  // insufficient_privilege
}

const DB_MESSAGE: Record<string, string> = {
  PGRST116: "Not found",
  "23P01":  "Time slot is already occupied",
  "42501":  "Forbidden",
}

/**
 * Logs a Supabase / PostgREST error with full context (message, code, hint,
 * details) and returns the appropriate HTTP response.
 *
 * Only server errors (status >= 500) are logged — 404s and 409s are expected
 * client-side conditions, not bugs.
 *
 * @param error  Supabase error object returned from a query or RPC call
 * @param ctx    Short label shown in the log line, e.g. 'create_reservation_auto'
 */
export function dbErr(error: DbError, ctx?: string): ReturnType<typeof err> {
  const status = DB_STATUS[error.code ?? ""] ?? 500

  if (status >= 500) {
    console.error(
      `[DB${ctx ? ` · ${ctx}` : ""}]`,
      JSON.stringify({
        message: error.message,
        code: error.code ?? null,
        hint: error.hint ?? null,
        details: error.details ?? null,
      }),
    )
  }

  const message = DB_MESSAGE[error.code ?? ""] ?? error.message
  return err(message, { status })
}
