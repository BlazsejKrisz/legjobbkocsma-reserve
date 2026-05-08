-- ============================================================================
-- Migration 025: Venue branding fields
-- ============================================================================
-- Adds per-venue branding data used in email templates and public pages.
-- address already exists on venues; all new columns are nullable.
-- ============================================================================

alter table public.venues
  add column if not exists logo_url      text,
  add column if not exists phone         text,
  add column if not exists website       text,
  add column if not exists email_contact text;
