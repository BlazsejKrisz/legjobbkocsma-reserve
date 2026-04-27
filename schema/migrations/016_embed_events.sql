-- Embed analytics: anonymous events fired by the iframe embed
CREATE TABLE IF NOT EXISTS embed_events (
  id         bigserial    PRIMARY KEY,
  event      text         NOT NULL,  -- load | slots_loaded | slots_empty | submit | error
  domain     text         NOT NULL,  -- referring hostname, or 'direct'
  venue_slug text,
  slot_count integer,                -- slots_loaded only
  status     text,                   -- submit only: confirmed | pending_manual_review
  code       integer,                -- error only: HTTP status code
  reason     text,                   -- error only: categorised string
  created_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS embed_events_domain_idx     ON embed_events (domain);
CREATE INDEX IF NOT EXISTS embed_events_event_idx      ON embed_events (event);
CREATE INDEX IF NOT EXISTS embed_events_created_at_idx ON embed_events (created_at);

-- All access goes through the server (service role bypasses RLS).
-- No direct client access allowed.
ALTER TABLE embed_events ENABLE ROW LEVEL SECURITY;
