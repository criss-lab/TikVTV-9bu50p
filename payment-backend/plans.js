export const plans = Object.freeze({
  half_day: Object.freeze({ amount: 5, durationMs: 13 * 60 * 60 * 1000, label: '13-hour access' }),
  day: Object.freeze({ amount: 10, durationMs: 24 * 60 * 60 * 1000, label: 'Daily access' }),
  week: Object.freeze({ amount: 40, durationMs: 7 * 24 * 60 * 60 * 1000, label: 'Weekly access' }),
  month: Object.freeze({ amount: 130, durationMs: 30 * 24 * 60 * 60 * 1000, label: 'Monthly access' }),
});
