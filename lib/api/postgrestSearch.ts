// PostgREST `.or()` filter takes a comma-separated list of atom expressions.
// User-provided search terms must be:
//
//   1. LIKE-escaped (% _ \) so wildcards in input don't behave as wildcards.
//   2. PostgREST-meta-escaped (, ( ) .) so a search like `foo),customer.eq.X`
//      can't break out of the ilike atom and append injected filters.
//
// Returns null when the input is empty / nothing safe remains, so the
// caller can skip the .or() entirely.
const PGRST_META = /[,()]/g
const LIKE_WILDCARDS = /[%_\\]/g

export function sanitizePostgrestSearch(raw: string | undefined | null): string | null {
  if (!raw) return null
  // Drop control chars first, then strip PostgREST meta entirely (rather
  // than try to escape — PostgREST has no portable escape for `,` inside
  // an .or() group).  Trim whitespace to avoid empty atoms.
  const cleaned = raw.replace(/[\x00-\x1f\x7f]/g, '').replace(PGRST_META, ' ').trim()
  if (!cleaned) return null
  // Now escape LIKE wildcards so user `%` / `_` is literal.
  return cleaned.replace(LIKE_WILDCARDS, '\\$&')
}
