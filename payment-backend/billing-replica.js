import pg from 'pg';

/**
 * Read-only fallback for a server-maintained, verified subscription replica.
 * Use a separate connection string for the Infinity VPN Supabase Postgres pool.
 * Never expose it to the browser, APK, logs or a VITE_ environment variable.
 *
 * This module deliberately does NOT replicate unverified client payment data,
 * grant access when no row exists, or treat the backup as a second checkout
 * writer. A later phase will implement a transactional Neon outbox and replay.
 */
const { Pool } = pg;
const connectionString = process.env.BILLING_REPLICA_DATABASE_URL;
const pool = connectionString ? new Pool({
  connectionString,
  ssl: { rejectUnauthorized: true },
  max: 2,
  connectionTimeoutMillis: 1500,
  idleTimeoutMillis: 10000,
  statement_timeout: 1500,
}) : null;

export function replicaConfigured() { return Boolean(pool); }

/** A missing row means no entitlement, not a free trial. */
export async function readReplicatedEntitlement(userId, now = new Date()) {
  if (!pool) throw new Error('Billing replica is not configured');
  if (typeof userId !== 'string' || !userId || userId.length > 200) {
    throw new TypeError('Invalid authenticated user');
  }
  const result = await pool.query(
    `SELECT plan_code, starts_at, expires_at, source_order_id, replicated_at
       FROM billing_private.subscription_replica
      WHERE user_id=$1 AND expires_at > $2::timestamptz LIMIT 1`,
    [userId, now.toISOString()],
  );
  const row = result.rows[0];
  if (!row || new Date(row.expires_at).getTime() <= now.getTime()) return null;
  return row;
}

export async function closeReplica() { if (pool) await pool.end(); }
