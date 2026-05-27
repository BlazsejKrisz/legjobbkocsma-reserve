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
  P0001:   422,  // raise_exception — our own PL/pgSQL business-rule violations
}

// Generic, schema-leak-free messages for the codes we map.  Any code we
// don't have an explicit message for falls back to `Database error` —
// never the raw `error.message` which can leak column names, partial
// values, constraint identifiers (think `customers_email_key` confirming
// an email exists), and other internals useful for crafting attacks.
const DB_MESSAGE: Record<string, string> = {
  PGRST116: "Not found",
  "23505":  "Conflict",
  "23503":  "Conflict",
  "23P01":  "Time slot is already occupied",
  "42501":  "Forbidden",
}

/**
 * Logs a Supabase / PostgREST error with full context (message, code, hint,
 * details) and returns the appropriate HTTP response.
 *
 * Only server errors (status >= 500) are logged — 404s and 409s are expected
 * client-side conditions, not bugs.  Client-bound responses use a generic
 * mapped message; the raw error.message is never shipped to the client.
 *
 * @param error  Supabase error object returned from a query or RPC call
 * @param ctx    Short label shown in the log line, e.g. 'create_reservation_auto'
 */
export function dbErr(error: DbError, ctx?: string): ReturnType<typeof err> {
  const status = DB_STATUS[error.code ?? ""] ?? 500

  // Always log full context for forensics — only 4xx codes are suppressed
  // in client responses, not in our internal logs.
  const logFn = status >= 500 ? console.error : console.warn
  logFn(
    `[DB${ctx ? ` · ${ctx}` : ""}]`,
    JSON.stringify({
      status,
      message: error.message,
      code: error.code ?? null,
      hint: error.hint ?? null,
      details: error.details ?? null,
    }),
  )

  // P0001 = raise_exception from our own PL/pgSQL functions.  These messages
  // are deliberate, controlled business-rule strings (e.g. 'booking too soon')
  // — safe to surface so clients (embed widget, dashboard) can show/translate
  // them, unlike raw Postgres errors which can leak schema internals.
  const message =
    DB_MESSAGE[error.code ?? ""] ??
    (error.code === "P0001" ? error.message :
      status >= 500 ? "Database error" : "Request failed")
  return err(message, { status })
}
