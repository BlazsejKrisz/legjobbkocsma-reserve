-- Partner API keys for third-party aggregators / booking sites.
-- key_hash stores SHA-256(raw_key) so the plaintext key is never persisted.
create table if not exists public.partner_api_keys (
  id         bigserial primary key,
  name       text    not null,
  key_hash   text    not null unique,
  venue_id   bigint  not null references public.venues(id) on delete cascade,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.partner_api_keys enable row level security;

create policy "super_admin can manage partner_api_keys"
  on public.partner_api_keys for all
  using (auth.jwt() ->> 'role' = 'super_admin');

grant select on public.partner_api_keys to service_role;
