-- ============================================================================
-- Migration 034: Drop old availability function overloads
-- ============================================================================
-- Migration 033 added an optional `p_exclude_reservation_id` parameter to
-- four functions.  Adding a parameter (even with a default) creates a NEW
-- overload rather than replacing the old one, because Postgres function
-- identity is based on the full argument list.
--
-- Result: callers passing 6 args to get_available_single_table_matches now
-- match BOTH overloads — Postgres throws 42725 "function is not unique" and
-- create_reservation_auto blows up.
--
-- Fix: drop the old (shorter) signatures.  The new ones (with the optional
-- exclude param) handle every existing call site since the param defaults
-- to NULL.
-- ============================================================================

drop function if exists public.get_available_tables(
  bigint, bigint, timestamptz, timestamptz, integer, text
);

drop function if exists public.get_available_single_table_matches(
  bigint, bigint, timestamptz, timestamptz, integer, text
);

drop function if exists public.find_best_table_combination(
  bigint, bigint, timestamptz, timestamptz, integer, text
);

drop function if exists public.find_availability_with_alternatives(
  bigint, timestamptz, integer, integer, bigint, text, integer, integer
);
