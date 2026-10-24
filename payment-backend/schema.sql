-- Apply this migration to the Neon database used by the Render payment API.
-- User IDs are text so they can store the UUID returned by Supabase Auth without
-- coupling payment storage to Supabase tables or foreign keys.
CREATE TABLE IF NOT EXISTS payment_orders (
  id BIGSERIAL PRIMARY KEY,
  merchant_reference TEXT NOT NULL UNIQUE,
  order_tracking_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('half_day', 'day', 'week', 'month')),
  amount_kes NUMERIC(12, 2) NOT NULL CHECK (amount_kes > 0),
  currency CHAR(3) NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  pesapal_redirect_url TEXT,
  paid_at TIMESTAMPTZ,
  pesapal_payment_method TEXT,
  pesapal_confirmation_code TEXT,
  raw_ipn JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Checkout must persist the local order before calling Pesapal. Pesapal only
-- returns order_tracking_id after SubmitOrderRequest, so it must be nullable
-- until that response is saved. CREATE TABLE IF NOT EXISTS does not repair
-- existing databases; this ALTER is intentionally safe to rerun.
ALTER TABLE payment_orders ALTER COLUMN order_tracking_id DROP NOT NULL;
-- Reconcile historical database layouts without losing existing values.
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS pesapal_payment_method TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS pesapal_confirmation_code TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS raw_ipn JSONB;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS payment_orders_user_created_idx
  ON payment_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_pending_created_idx
  ON payment_orders (created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('half_day', 'day', 'week', 'month')),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  source_order_id BIGINT NOT NULL REFERENCES payment_orders(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS subscriptions_expiry_idx ON subscriptions (expires_at);

CREATE TABLE IF NOT EXISTS pesapal_ipn_events (
  id BIGSERIAL PRIMARY KEY,
  notification_id TEXT NOT NULL,
  order_tracking_id TEXT NOT NULL,
  merchant_reference TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- The registered Pesapal IPN ID is shared by every callback, so key events by
-- order and verified status. Repeated callbacks remain idempotent while a later
-- transition (for example Pending -> Completed) is retained in the audit trail.
ALTER TABLE pesapal_ipn_events
  DROP CONSTRAINT IF EXISTS pesapal_ipn_events_notification_id_order_tracking_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS pesapal_ipn_events_notification_tracking_status_key
  ON pesapal_ipn_events (notification_id, order_tracking_id, verification_status);
CREATE INDEX IF NOT EXISTS pesapal_ipn_events_tracking_idx
  ON pesapal_ipn_events (order_tracking_id);

-- One immutable 15-minute preview per account, shared by web and APK clients.
CREATE TABLE IF NOT EXISTS free_preview_sessions (
  user_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > started_at)
);
CREATE INDEX IF NOT EXISTS free_preview_sessions_expiry_idx ON free_preview_sessions (expires_at);

-- Seven distinct channel previews per signed-in account; deadlines never reset.
CREATE TABLE IF NOT EXISTS free_channel_previews (
 user_id TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
 PRIMARY KEY (user_id, channel_id),
 CHECK (expires_at > started_at)
);
CREATE INDEX IF NOT EXISTS free_channel_previews_user_idx ON free_channel_previews(user_id);

-- QR pairing: a short-lived challenge contains no credentials. Only a signed-in
-- phone can approve it; the TV receives a separate revocable device credential.
CREATE TABLE IF NOT EXISTS tv_pairings (
  id UUID PRIMARY KEY,
  challenge_hash TEXT NOT NULL UNIQUE,
  poll_hash TEXT NOT NULL UNIQUE,
  display_code TEXT NOT NULL,
  device_token_hash TEXT UNIQUE,
  user_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tv_pairings_user_idx ON tv_pairings(user_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS tv_remote_commands (
  id BIGSERIAL PRIMARY KEY,
  pairing_id UUID NOT NULL REFERENCES tv_pairings(id) ON DELETE CASCADE,
  command TEXT NOT NULL CHECK (command IN ('up','down','left','right','select','back','home','play_pause','next','previous')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tv_remote_commands_pairing_idx ON tv_remote_commands(pairing_id,id);

-- Guest preview allocations are server-owned and can be claimed only once by a
-- Supabase-authenticated account. Store only a SHA-256 hash of the bearer secret.
CREATE TABLE IF NOT EXISTS guest_preview_installations (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash)=64),
  claimed_user_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS guest_channel_previews (
  token_hash TEXT NOT NULL REFERENCES guest_preview_installations(token_hash) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '15 minutes'),
  PRIMARY KEY(token_hash,channel_id),
  CHECK (expires_at>started_at)
);
CREATE INDEX IF NOT EXISTS guest_channel_previews_token_idx ON guest_channel_previews(token_hash);


-- Hot-path indexes for payment recovery and active TV pairing lookups.
CREATE INDEX IF NOT EXISTS payment_orders_user_recovery_idx
  ON payment_orders (user_id, created_at DESC)
  WHERE order_tracking_id IS NOT NULL AND status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS payment_orders_recovery_cursor_idx
  ON payment_orders (id)
  WHERE order_tracking_id IS NOT NULL AND status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS tv_pairings_active_token_idx
  ON tv_pairings (device_token_hash)
  WHERE approved_at IS NOT NULL AND revoked_at IS NULL;
