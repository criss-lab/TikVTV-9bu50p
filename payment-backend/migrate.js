import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required to migrate the Neon payment database.');
  process.exit(1);
}
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 15000,
});
try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  const result = await pool.query(`
    SELECT
      to_regclass('public.payment_orders') IS NOT NULL AS payment_orders,
      to_regclass('public.subscriptions') IS NOT NULL AS subscriptions,
      to_regclass('public.pesapal_ipn_events') IS NOT NULL AS pesapal_ipn_events,
      to_regclass('public.free_preview_sessions') IS NOT NULL AS free_preview_sessions
  `);
  const tables = result.rows[0];
  if (!tables.payment_orders || !tables.subscriptions || !tables.pesapal_ipn_events || !tables.free_preview_sessions) {
    throw new Error('Required payment and viewing-access tables were not created.');
  }
  console.log('Neon payment schema migration verified (table names only; no secrets or customer data emitted).');
} finally {
  await pool.end();
}
