-- ============================================================================
-- Migration 050: persist GDPR consent captured by the public booking form
-- ============================================================================
-- The embed booking form collects an explicit data-processing consent (a
-- required checkbox, the exact text shown, and the privacy-policy URL) but the
-- API was silently dropping it (PartnerReservationSchema had no `consents`
-- field, so Zod stripped it).  For GDPR accountability we store the consent
-- alongside the reservation: what was agreed to, the wording, when, and from
-- which IP.  Written by POST /api/public/reservations right after the row is
-- created (service role), so no RPC signature change is needed.
-- ============================================================================

alter table public.reservations
  add column if not exists consent_data_processing boolean,
  add column if not exists consent_text             text,
  add column if not exists consent_privacy_url      text,
  add column if not exists consent_at               timestamptz,
  add column if not exists consent_ip                text;

comment on column public.reservations.consent_data_processing is
  'GDPR: customer agreed to data processing for this reservation (public form).';
comment on column public.reservations.consent_text is
  'Exact consent wording shown to the customer at submit time.';
comment on column public.reservations.consent_privacy_url is
  'Privacy-policy URL presented with the consent, if any.';
comment on column public.reservations.consent_at is
  'When the consent was recorded (server time).';
comment on column public.reservations.consent_ip is
  'Client IP that submitted the consent (audit trail).';
