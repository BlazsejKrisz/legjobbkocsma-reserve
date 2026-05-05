-- Per-venue CORS whitelist: list of allowed origins for the public booking API.
-- Empty array means all origins are permitted (backward compatibility).
alter table public.venues
  add column if not exists allowed_origins text[] not null default '{}';
