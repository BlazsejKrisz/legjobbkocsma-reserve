-- ============================================================================
-- Migration 029: venue-logos storage bucket
-- ============================================================================
-- Public bucket so emails (and any public page) can load logos via URL.
-- Writes go through POST /api/venues/[id]/logo which requires super_admin and
-- uses the service role, so no public write policies are added.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'venue-logos',
  'venue-logos',
  true,
  2 * 1024 * 1024,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
