export const plans = Object.freeze({
  half_day: Object.freeze({ amount: 5, durationMs: 13 * 60 * 60 * 1000, label: '13-hour access', displayName: '13 hours', durationLabel: '13 hours' }),
  day: Object.freeze({ amount: 10, durationMs: 24 * 60 * 60 * 1000, label: 'Daily access', displayName: 'Daily', durationLabel: '24 hours' }),
  week: Object.freeze({ amount: 40, durationMs: 7 * 24 * 60 * 60 * 1000, label: 'Weekly access', displayName: 'Weekly', durationLabel: '7 days' }),
  month: Object.freeze({ amount: 130, durationMs: 30 * 24 * 60 * 60 * 1000, label: 'Monthly access', displayName: 'Monthly', durationLabel: '30 days' }),
});
