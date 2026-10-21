import test from 'node:test';
import assert from 'node:assert/strict';
import { plans } from '../plans.js';

test('server-side plans preserve the approved KSh prices and durations', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(plans).map(([key, plan]) => [key, { amount: plan.amount, durationMs: plan.durationMs }])),
    {
      half_day: { amount: 5, durationMs: 12 * 60 * 60 * 1000 },
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
