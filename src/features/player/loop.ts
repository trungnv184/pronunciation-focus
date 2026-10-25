/** Pure helpers for the A–B segment loop. All times are in seconds. */

export type LoopPoints = { a: number | null; b: number | null };
export type Segment = { start: number; end: number };

/** Seconds added or removed by the ±1 s nudge buttons. */
export const NUDGE_SEC = 1;

/** True when looping should jump back to A: both points are set, A < B, and `t` has reached B. */
export function shouldLoop(t: number, a: number | null, b: number | null): boolean {
  if (a === null || b === null || !(b > a)) return false;
  return t >= b;
}

/** Clamp `t` to `[0, duration]`. A missing or non-positive duration only clamps at 0. */
export function clampTime(t: number, duration?: number): number {
  const lower = Math.max(0, Number.isFinite(t) ? t : 0);
  return duration !== undefined && duration > 0 ? Math.min(lower, duration) : lower;
}

/** Move `t` by `delta` seconds, staying inside the video. */
export function nudge(t: number, delta: number, duration?: number): number {
  return clampTime(t + delta, duration);
}

/** Round to tenths so captured times stay readable and stable. */
export function roundTime(t: number): number {
  return Math.round(t * 10) / 10;
}

/** Keep A before B: swap them when both are set and reversed. */
export function orderPoints(points: LoopPoints): LoopPoints {
  const { a, b } = points;
  return a !== null && b !== null && a > b ? { a: b, b: a } : points;
}

/** Set A or B to `t` (clamped and rounded), then re-order. */
export function setPoint(
  points: LoopPoints,
  which: "a" | "b",
  t: number,
  duration?: number,
): LoopPoints {
  const value = roundTime(clampTime(t, duration));
  return orderPoints({ ...points, [which]: value });
}

/** Nudge A or B by `delta`; does nothing when that point isn't set. */
export function nudgePoint(
  points: LoopPoints,
  which: "a" | "b",
  delta: number,
  duration?: number,
): LoopPoints {
  const current = points[which];
  if (current === null) return points;
  return setPoint(points, which, nudge(current, delta, duration), duration);
}

/** The segment when both points are set and A < B, else null. */
export function toSegment(points: LoopPoints): Segment | null {
  const { a, b } = points;
  return a !== null && b !== null && b > a ? { start: a, end: b } : null;
}
