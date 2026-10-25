/**
 * Local calendar dates as `YYYY-MM-DD`. Streaks are about the learner's own days, so these use
 * the device's local time zone, never UTC.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** `new Date(2026, 9, 25, 23, 30)` → `"2026-10-25"` (local, not UTC). */
export function toLocalDate(date: Date = new Date()): string {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True for a real calendar date in `YYYY-MM-DD` form (rejects `2026-02-30`). */
export function isLocalDate(value: unknown): value is string {
  return typeof value === "string" && dayNumber(value) !== null;
}

/**
 * Days since the epoch for a `YYYY-MM-DD` string, or null if invalid. Computed in UTC on purpose:
 * the string is already a local date, and UTC arithmetic has no DST gaps.
 */
export function dayNumber(date: string): number | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return Math.round(ms / MS_PER_DAY);
}
