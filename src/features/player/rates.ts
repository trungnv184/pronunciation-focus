/** Playback-rate helpers. The player only accepts rates from `getAvailablePlaybackRates()`. */

/** Rates learners use most, shown first. */
export const PREFERRED_RATES: readonly number[] = [0.5, 0.75, 1];

/** Available preferred rates first (in that order), then the remaining rates ascending. */
export function orderRates(available: readonly number[]): number[] {
  const unique = [...new Set(available)].sort((x, y) => x - y);
  const first = PREFERRED_RATES.filter((r) => unique.includes(r));
  return [...first, ...unique.filter((r) => !first.includes(r))];
}

/** The next slower (-1) or faster (+1) available rate, or `current` at either end. */
export function stepRate(available: readonly number[], current: number, direction: -1 | 1): number {
  const sorted = [...new Set(available)].sort((x, y) => x - y);
  const next =
    direction > 0 ? sorted.find((r) => r > current) : [...sorted].reverse().find((r) => r < current);
  return next ?? current;
}

/** 0.75 → "0.75×" */
export function formatRate(rate: number): string {
  return `${rate}×`;
}
