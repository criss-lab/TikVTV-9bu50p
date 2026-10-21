import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { plans } from '../plans.js';

test('server-side plans preserve the approved KSh prices and durations', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(plans).map(([key, plan]) => [key, { amount: plan.amount, durationMs: plan.durationMs }])),
    {
      half_day: { amount: 5, durationMs: 13 * 60 * 60 * 1000 },
      day: { amount: 10, durationMs: 24 * 60 * 60 * 1000 },
      week: { amount: 40, durationMs: 7 * 24 * 60 * 60 * 1000 },
      month: { amount: 130, durationMs: 30 * 24 * 60 * 60 * 1000 },
    },
  );
});

test('plan catalogue is immutable and contains no client-defined price field', () => {
  assert.equal(Object.isFrozen(plans), true);
  for (const plan of Object.values(plans)) {
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(typeof plan.amount, 'number');
    assert.equal(typeof plan.durationMs, 'number');
  }
});

test('checkout migration allows a missing tracking ID before the Pesapal response', async () => {
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  assert.ok(schema.includes('ALTER TABLE payment_orders ALTER COLUMN order_tracking_id DROP NOT NULL'));
});

test('database migration verifies tracking ID nullability', async () => {
  const migration = await readFile(new URL('../migrate.js', import.meta.url), 'utf8');
  assert.ok(migration.includes('order_tracking_id_nullable'));
});
