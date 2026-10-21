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
  payment_method TEXT,
  confirmation_code TEXT,
  raw_ipn JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Checkout must persist the local order before calling Pesapal. Pesapal only
-- returns order_tracking_id after SubmitOrderRequest, so it must be nullable
-- until that response is saved. CREATE TABLE IF NOT EXISTS does not repair
-- existing databases; this ALTER is intentionally safe to rerun.
ALTER TABLE payment_orders ALTER COLUMN order_tracking_id DROP NOT NULL;

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
